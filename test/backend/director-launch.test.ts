import { Database } from 'bun:sqlite';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, test } from 'bun:test';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import type { DirectorOutput, DirectorSuggestion } from 'aidd-shared';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import type { WebContext } from '../../backend/src/context.ts';
import { type WebDatabase, wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import {
	directorChatMessages,
	directorChatSessions,
	directorCycles,
	pipelineSessions,
	runs,
	suggestions,
} from '../../backend/src/db/schema.ts';
import { createDirectorRoutes } from '../../backend/src/routes/director.ts';
import type { DirectorChatService } from '../../backend/src/services/director/chatService.ts';
import { DirectorSuggestionService } from '../../backend/src/services/director/suggestionService.ts';
import { DirectorService } from '../../backend/src/services/directorService.ts';
import {
	type DirectAiCompleteRequest,
	type DirectAiRunner,
	disabledDirectAiRunner,
} from '../../backend/src/services/directAiService.ts';
import {
	persistCycleResult,
	toCycleRecord,
} from '../../backend/src/services/director/cyclePersistence.ts';
import type { FleetSummary } from '../../backend/src/services/director/types.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import { RunService } from '../../backend/src/services/runService.ts';
import { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';
import {
	directorOutputWriter,
	heartbeatTerminator,
	writeFakeCliEntrypoint,
} from './_helpers/heartbeat-stub.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
function makeConfig(web: ResolvedWebConfig): { web: ResolvedWebConfig } & ResolvedConfig {
	return {
		cli: 'native',
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low',
		timeoutSeconds: 3600,
		preflightDoctor: false,
		web,
	};
}

// RunService schedules background timers (CLI ingest + orphan-run sweep) that keep firing after a
// test closes its sqlite handle, surfacing as post-close DB error logs. Track every RunService the
// helper builds and dispose them after each test so their timers are cleared before the DB closes.
const runServicesToDispose: RunService[] = [];

afterEach(() => {
	for (const runService of runServicesToDispose.splice(0)) runService.markDisposed();
});

async function makeWorkspace(cliScript: string = 'console.log("launch");\n') {
	const workspace = await testTempDir('aidd-coord-launch-');
	const rootDir = await testTempDir('aidd-coord-launch-root-');
	await writeFakeCliEntrypoint(rootDir, cliScript);
	const projectDir = join(workspace, 'sample-project');
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await Bun.write(join(projectDir, '.aidd', 'spec.md'), '# Sample\n');
	const web = {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [workspace],
		dataDir: join(workspace, 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3211,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: true,
	};
	const config = makeConfig(web);
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	const { db, commands } = wrapWebDatabase(sqlite);
	const hub = new WebSocketHub();
	const projectService = new ProjectService(web);
	const telemetryService = new TelemetryService({ commands, db });
	const runService = new RunService(
		config,
		db,
		commands,
		hub,
		projectService,
		rootDir,
		telemetryService,
	);
	runServicesToDispose.push(runService);
	const service = new DirectorService(config, db, commands, hub, projectService, runService);
	return {
		commands,
		config,
		db,
		hub,
		projectDir,
		projectService,
		rootDir,
		runService,
		service,
		sqlite,
		workspace,
	};
}

async function writeArtifactCheck(
	projectDir: string,
	overrides: Partial<{
		fresh: number;
		missing: number;
		present: number;
		requiredMissing: number;
		stale: number;
		total: number;
	}> = {},
): Promise<void> {
	const summary = {
		fresh: 8,
		missing: 0,
		present: 8,
		requiredMissing: 0,
		stale: 0,
		total: 8,
		...overrides,
	};
	await Bun.write(
		join(projectDir, '.aidd', '.artifacts-check.json'),
		`${JSON.stringify({
			checkedAt: new Date().toISOString(),
			staleThresholdDays: 30,
			summary,
		})}\n`,
	);
}

async function writeFeature(projectDir: string, id: string, extra: Record<string, unknown> = {}) {
	await mkdir(join(projectDir, '.aidd', 'features', id), { recursive: true });
	await Bun.write(
		join(projectDir, '.aidd', 'features', id, 'feature.json'),
		`${JSON.stringify({
			id,
			title: id,
			status: 'backlog',
			passes: false,
			priority: 2,
			...extra,
		})}\n`,
	);
}

async function writeProjectProfile(projectDir: string, extra: Record<string, unknown> = {}) {
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await Bun.write(
		join(projectDir, '.aidd', 'project-profile.json'),
		`${JSON.stringify({
			authMode: 'local_owner',
			bucket: 'single_user_local',
			criticality: 'utility',
			dataSensitivity: 'low',
			deployment: 'local',
			externalIntegrations: 'none',
			source: 'explicit',
			updatedAt: new Date().toISOString(),
			...extra,
		})}\n`,
	);
}

async function initGitProject(projectDir: string): Promise<void> {
	await mkdir(join(projectDir, 'src'), { recursive: true });
	await runGit(projectDir, ['init']);
	await runGit(projectDir, ['config', 'user.email', 'aidd-test@example.invalid']);
	await runGit(projectDir, ['config', 'user.name', 'aidd Test']);
	await Bun.write(join(projectDir, 'package.json'), '{"name":"test-project"}\n');
	await runGit(projectDir, ['add', 'package.json']);
	await runGit(projectDir, ['commit', '-m', 'chore: init']);
}

async function commitSourceFile(projectDir: string, relativePath: string, content: string) {
	await Bun.write(join(projectDir, relativePath), content);
	await runGit(projectDir, ['add', relativePath]);
	await runGit(projectDir, ['commit', '-m', `feat: update ${relativePath}`]);
}

async function runGit(projectDir: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) === 0) return;
	const stderr = await new Response(proc.stderr).text();
	throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
}

function fakeBackend(
	reply: string,
	captured: PromptInput[] = [],
	filesModified: string[] = [],
): CLIBackend {
	return {
		idleDefaults: { killMs: 5000, nudgeMs: 4000 },
		name: 'native',
		async *runPrompt(input: PromptInput): AsyncIterable<AgentEvent> {
			captured.push(input);
			yield { type: 'assistant_text', chunk: reply };
			yield { type: 'done', exitCode: 0, filesModified };
		},
	};
}

function directAiRunner(reply: string | null): {
	calls: string[];
	metaCalls: {
		model: string | undefined;
		reasoningEffort: DirectAiCompleteRequest['reasoningEffort'];
	}[];
	requests: DirectAiCompleteRequest[];
	runner: DirectAiRunner;
} {
	const calls: string[] = [];
	const metaCalls: {
		model: string | undefined;
		reasoningEffort: DirectAiCompleteRequest['reasoningEffort'];
	}[] = [];
	const requests: DirectAiCompleteRequest[] = [];
	return {
		calls,
		metaCalls,
		requests,
		runner: {
			async completeJson<T>(request: DirectAiCompleteRequest) {
				calls.push(request.prompt);
				requests.push(request);
				if (reply === null) return null;
				return JSON.parse(reply) as T;
			},
			async completeText(request: DirectAiCompleteRequest) {
				calls.push(request.prompt);
				requests.push(request);
				return reply;
			},
			isSurfaceEnabled() {
				return reply !== null;
			},
			resolveClientConfig() {
				return null;
			},
			resolveSurfaceMeta(_surface, model, reasoningEffort) {
				metaCalls.push({ model, reasoningEffort });
				return reply !== null
					? {
							model: model ?? 'test-model',
							provider: 'test',
							reasoningEffort: reasoningEffort ?? 'low',
						}
					: null;
			},
			updateConfig() {},
		},
	};
}

async function seedSuggestion(
	db: WebDatabase,
	input: {
		id: string;
		projectId: string | null;
		suggestedArgs?: null | string;
		suggestedRecipe?: null | string;
	},
): Promise<void> {
	const now = Date.now();
	await db.insert(directorCycles).values({
		id: 'cycle_test',
		startedAt: now,
		status: 'completed',
	});
	await db.insert(suggestions).values({
		createdAt: now,
		cycleId: 'cycle_test',
		description: 'desc',
		id: input.id,
		projectId: input.projectId,
		reasoning: 'because',
		riskLevel: 'MEDIUM',
		status: 'pending',
		taskType: 'audit_remediation',
		title: 'Test suggestion',
		...(input.suggestedArgs === undefined ? {} : { suggestedArgs: input.suggestedArgs }),
		...(input.suggestedRecipe === undefined ? {} : { suggestedRecipe: input.suggestedRecipe }),
	});
}

function makeSuggestion(overrides: Partial<DirectorSuggestion> = {}): DirectorSuggestion {
	return {
		description: 'desc',
		evidence: {},
		projectId: null,
		reasoning: 'because',
		riskLevel: 'MEDIUM',
		taskType: 'audit_remediation',
		title: 'Test suggestion',
		...overrides,
	};
}

describe('DirectorService.persistCycleResult', () => {
	test('rolls back partial suggestion inserts when a later insert throws', async () => {
		const { commands, config, db, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const cycleId = 'cycle_tx_rollback';
			await db.insert(directorCycles).values({
				id: cycleId,
				startedAt: Date.now(),
				status: 'running',
			});

			const privateApi = service as unknown as { chatService: DirectorChatService };
			const chatService = privateApi.chatService;
			const hub = new WebSocketHub();

			// The second suggestion carries a riskLevel the ck_suggestions_risk_level CHECK
			// rejects, so its insert throws mid-transaction inside the persistCycleResult command
			// — exercising the rollback that keeps the first insert and the cycle update atomic.
			const output: DirectorOutput = {
				fleetSummary: {
					byRisk: { HIGH: 0, LOW: 0, MEDIUM: 2 },
					byType: { audit_remediation: 1, dependency_hygiene: 1 },
					crossProjectPatterns: [],
					totalSuggestions: 2,
				},
				suggestions: [
					makeSuggestion({ title: 'first' }),
					{
						...makeSuggestion({ taskType: 'dependency_hygiene', title: 'second' }),
						riskLevel: 'INVALID' as DirectorSuggestion['riskLevel'],
					},
				],
			};

			const deps = {
				chatService,
				commands,
				db,
				getConfig: () => config,
				hub,
			};

			await expect(
				persistCycleResult(
					deps,
					cycleId,
					{ fleetAggregations: { fleetHealthScore: 50 } } as FleetSummary,
					output,
					0,
					'ok',
				),
			).rejects.toThrow();

			const rows = await db
				.select()
				.from(suggestions)
				.where(eq(suggestions.cycleId, cycleId));
			expect(rows).toHaveLength(0);

			const cycle = (
				await db.select().from(directorCycles).where(eq(directorCycles.id, cycleId))
			)[0];
			expect(cycle?.status).toBe('running');
			expect(cycle?.completedAt).toBeNull();
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('auto-dismisses stale pending suggestions from previous cycles', async () => {
		const { commands, config, db, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const now = Date.now();
			const oldCycleId = 'cycle_old';
			const newCycleId = 'cycle_new';
			await db.insert(directorCycles).values([
				{ id: oldCycleId, startedAt: now - 2000, status: 'completed' },
				{ id: newCycleId, startedAt: now - 1000, status: 'running' },
			]);
			await db.insert(suggestions).values([
				{
					createdAt: now - 1500,
					cycleId: oldCycleId,
					description: 'old pending',
					id: 'old_pending',
					projectId: 'project-a',
					reasoning: 'r',
					riskLevel: 'MEDIUM',
					status: 'pending',
					taskType: 'audit_remediation',
					title: 'Old pending',
				},
				{
					createdAt: now - 1500,
					cycleId: oldCycleId,
					description: 'old dismissed',
					id: 'old_dismissed',
					projectId: 'project-a',
					reasoning: 'r',
					resolvedAt: now - 1000,
					riskLevel: 'LOW',
					status: 'dismissed',
					taskType: 'dependency_hygiene',
					title: 'Old dismissed',
				},
				{
					createdAt: now - 1500,
					cycleId: oldCycleId,
					description: 'old launched',
					id: 'old_launched',
					projectId: 'project-b',
					reasoning: 'r',
					resolvedAt: now - 1000,
					riskLevel: 'HIGH',
					status: 'launched',
					taskType: 'stale_project',
					title: 'Old launched',
				},
				{
					// An orphaned launch claim: a launchSuggestion call flipped this to
					// 'launching' but the spawning process died before writing 'launched',
					// so the row is stuck and un-removable through the UI.
					createdAt: now - 1500,
					cycleId: oldCycleId,
					description: 'old launching',
					id: 'old_launching',
					projectId: 'project-c',
					reasoning: 'r',
					riskLevel: 'MEDIUM',
					status: 'launching',
					taskType: 'audit_remediation',
					title: 'Old launching',
				},
			]);

			const privateApi = service as unknown as { chatService: DirectorChatService };
			const chatService = privateApi.chatService;
			const hub = new WebSocketHub();
			const output: DirectorOutput = {
				fleetSummary: {
					byRisk: { HIGH: 0, LOW: 0, MEDIUM: 1 },
					byType: { audit_remediation: 1 },
					crossProjectPatterns: [],
					totalSuggestions: 1,
				},
				suggestions: [makeSuggestion({ title: 'New suggestion' })],
			};
			await persistCycleResult(
				{ chatService, commands, db, getConfig: () => config, hub },
				newCycleId,
				{ fleetAggregations: { fleetHealthScore: 75 } } as FleetSummary,
				output,
				0,
				'ok',
			);

			const allSuggestions = await db
				.select()
				.from(suggestions)
				.orderBy(suggestions.createdAt);
			expect(allSuggestions).toHaveLength(5);
			const dismissed = allSuggestions.filter((s) => s.status === 'dismissed');
			// The prior 'pending' row AND the orphaned 'launching' row are both retired, alongside
			// the already-dismissed one, so no aged/expired actionable suggestion is left over.
			expect(dismissed).toHaveLength(3);
			expect(dismissed.map((s) => s.id).sort()).toEqual([
				'old_dismissed',
				'old_launching',
				'old_pending',
			]);
			expect(dismissed.find((s) => s.id === 'old_pending')?.resolvedAt).toBeGreaterThan(0);
			expect(dismissed.find((s) => s.id === 'old_launching')?.resolvedAt).toBeGreaterThan(0);
			// No 'launching' rows survive a completed cycle.
			expect(allSuggestions.filter((s) => s.status === 'launching')).toHaveLength(0);
			const launched = allSuggestions.filter((s) => s.status === 'launched');
			expect(launched).toHaveLength(1);
			expect(launched[0]!.id).toBe('old_launched');
			const pending = allSuggestions.filter((s) => s.status === 'pending');
			expect(pending).toHaveLength(1);
			expect(pending[0]!.cycleId).toBe(newCycleId);
			expect(pending[0]!.title).toBe('New suggestion');
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('failed cycle preserves existing pending suggestions', async () => {
		const { commands, config, db, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const now = Date.now();
			const oldCycleId = 'cycle_old_survive';
			const failCycleId = 'cycle_fail';
			await db.insert(directorCycles).values([
				{ id: oldCycleId, startedAt: now - 2000, status: 'completed' },
				{ id: failCycleId, startedAt: now - 1000, status: 'running' },
			]);
			await db.insert(suggestions).values({
				createdAt: now - 1500,
				cycleId: oldCycleId,
				description: 'should survive',
				id: 'sug_survive',
				projectId: 'project-a',
				reasoning: 'r',
				riskLevel: 'HIGH',
				status: 'pending',
				taskType: 'audit_remediation',
				title: 'Should survive',
			});

			const privateApi = service as unknown as { chatService: DirectorChatService };
			const chatService = privateApi.chatService;
			const hub = new WebSocketHub();
			await persistCycleResult(
				{ chatService, commands, db, getConfig: () => config, hub },
				failCycleId,
				{ fleetAggregations: { fleetHealthScore: 50 } } as FleetSummary,
				undefined,
				1,
				'missing',
			);

			const pending = await db
				.select()
				.from(suggestions)
				.where(eq(suggestions.status, 'pending'));
			expect(pending).toHaveLength(1);
			expect(pending[0]!.id).toBe('sug_survive');
			expect(pending[0]!.projectId).toBe('project-a');
			const cycle = (
				await db.select().from(directorCycles).where(eq(directorCycles.id, failCycleId))
			)[0];
			expect(cycle!.status).toBe('failed');
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('persists all suggestions when no prior pending suggestions exist', async () => {
		const { commands, config, db, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const cycleId = 'cycle_fresh';
			await db.insert(directorCycles).values({
				id: cycleId,
				startedAt: Date.now(),
				status: 'running',
			});

			const privateApi = service as unknown as { chatService: DirectorChatService };
			const chatService = privateApi.chatService;
			const hub = new WebSocketHub();
			const output: DirectorOutput = {
				fleetSummary: {
					byRisk: { HIGH: 1, LOW: 1, MEDIUM: 1 },
					byType: { audit_remediation: 2, dependency_hygiene: 1 },
					crossProjectPatterns: [],
					totalSuggestions: 3,
				},
				suggestions: [
					makeSuggestion({
						projectId: 'project-a',
						taskType: 'audit_remediation',
						title: 'A',
					}),
					makeSuggestion({
						projectId: 'project-b',
						taskType: 'dependency_hygiene',
						title: 'B',
					}),
					makeSuggestion({
						projectId: 'project-a',
						riskLevel: 'HIGH',
						taskType: 'stale_project',
						title: 'C',
					}),
				],
			};
			await persistCycleResult(
				{ chatService, commands, db, getConfig: () => config, hub },
				cycleId,
				{ fleetAggregations: { fleetHealthScore: 80 } } as FleetSummary,
				output,
				0,
				'ok',
			);

			const pending = await db
				.select()
				.from(suggestions)
				.where(eq(suggestions.status, 'pending'));
			expect(pending).toHaveLength(3);
			expect(pending.map((s) => s.title).sort()).toEqual(['A', 'B', 'C']);
			const cycle = (
				await db.select().from(directorCycles).where(eq(directorCycles.id, cycleId))
			)[0];
			expect(cycle!.totalSuggestions).toBe(3);
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('exposes running cycle stage from director artifacts', async () => {
		const { config, db, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const cycleId = 'cycle_stage_artifacts';
			await db.insert(directorCycles).values({
				id: cycleId,
				startedAt: Date.now(),
				status: 'running',
			});
			const cycleDir = join(config.web.dataDir, 'director');
			await mkdir(cycleDir, { recursive: true });
			await Bun.write(join(cycleDir, `${cycleId}-fleet-summary.json`), '{}\n');

			const cycles = await service.listCycles();
			const cycle = cycles.find((candidate) => candidate.id === cycleId);

			expect(cycle).toBeDefined();
			expect(cycle?.stage).toBe('writing_context');
			expect(cycle?.artifacts.fleetSummaryExists).toBe(true);
			expect(cycle?.artifacts.outputExists).toBe(false);
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('exposes active Direct AI identity through Director cycle records', async () => {
		const { config, rootDir, sqlite, workspace } = await makeWorkspace();
		try {
			const cycleId = 'cycle_direct_ai_identity';
			const record = toCycleRecord(
				{
					completedAt: null,
					failureReason: null,
					fleetHealthScore: null,
					id: cycleId,
					startedAt: Date.now(),
					status: 'running',
					totalSuggestions: null,
				},
				() => config,
				new Map([
					[
						cycleId,
						{
							directAiMeta: {
								model: 'gpt-5.6',
								provider: 'openai',
								reasoningEffort: 'high' as const,
							},
							stage: 'running_direct_ai' as const,
						},
					],
				]),
			);

			expect(record.stage).toBe('running_direct_ai');
			expect(record.directAiMeta).toEqual({
				model: 'gpt-5.6',
				provider: 'openai',
				reasoningEffort: 'high',
			});
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('reconciles orphaned running director cycles to failed', async () => {
		const { db, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			await db.insert(directorCycles).values({
				id: 'cycle_stale',
				startedAt: Date.now() - 1000,
				status: 'running',
			});

			await service.reconcileStaleCycles();

			const cycle = (
				await db.select().from(directorCycles).where(eq(directorCycles.id, 'cycle_stale'))
			)[0];
			expect(cycle?.status).toBe('failed');
			expect(cycle?.completedAt).toBeNumber();
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('user-dismissed suggestions suppress identical re-suggestions; cycle-retired ones do not', async () => {
		const { commands, config, db, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const now = Date.now();
			const oldCycleId = 'cycle_dedup_old';
			const newCycleId = 'cycle_dedup_new';
			await db.insert(directorCycles).values([
				{ id: oldCycleId, startedAt: now - 5000, status: 'completed' },
				{ id: newCycleId, startedAt: now - 1000, status: 'running' },
			]);
			await db.insert(suggestions).values([
				{
					createdAt: now - 4000,
					cycleId: oldCycleId,
					description: 'd',
					id: 'sug_user_dismissed',
					projectId: 'agentwatch',
					reasoning: 'r',
					riskLevel: 'LOW',
					status: 'pending',
					taskType: 'artifact_maintenance',
					title: 'agentwatch: reconcile aidd artifacts',
				},
				{
					createdAt: now - 4000,
					cycleId: oldCycleId,
					description: 'd',
					id: 'sug_auto_retired',
					projectId: 'starsync',
					reasoning: 'r',
					riskLevel: 'LOW',
					status: 'dismissed',
					dismissedBy: 'cycle_retire',
					resolvedAt: now - 3000,
					taskType: 'artifact_maintenance',
					title: 'starsync: reconcile aidd artifacts',
				},
			]);
			// The operator explicitly dismisses one — this must set dismissedBy 'user'.
			await service.dismissSuggestion('sug_user_dismissed');
			const dismissedRow = (
				await db.select().from(suggestions).where(eq(suggestions.id, 'sug_user_dismissed'))
			)[0];
			expect(dismissedRow?.dismissedBy).toBe('user');

			const privateApi = service as unknown as { chatService: DirectorChatService };
			const output: DirectorOutput = {
				fleetSummary: {
					byRisk: { HIGH: 0, LOW: 3, MEDIUM: 0 },
					byType: { artifact_maintenance: 3 },
					crossProjectPatterns: [],
					totalSuggestions: 3,
				},
				suggestions: [
					// Identical (case/whitespace-insensitive) to the user dismissal → suppressed.
					makeSuggestion({
						projectId: 'agentwatch',
						taskType: 'artifact_maintenance',
						title: '  Agentwatch: reconcile   aidd artifacts ',
					}),
					// Identical to the cycle-retired row → re-inserted (auto retire never suppresses).
					makeSuggestion({
						projectId: 'starsync',
						taskType: 'artifact_maintenance',
						title: 'starsync: reconcile aidd artifacts',
					}),
					// Same title, different project → not suppressed.
					makeSuggestion({
						projectId: 'routebook',
						taskType: 'artifact_maintenance',
						title: 'agentwatch: reconcile aidd artifacts',
					}),
				],
			};
			await persistCycleResult(
				{
					chatService: privateApi.chatService,
					commands,
					db,
					getConfig: () => config,
					hub: new WebSocketHub(),
				},
				newCycleId,
				{ fleetAggregations: { fleetHealthScore: 75 } } as FleetSummary,
				output,
				0,
				'ok',
			);

			const pending = (await db.select().from(suggestions)).filter(
				(row) => row.status === 'pending',
			);
			expect(pending.map((row) => row.projectId).sort()).toEqual(['routebook', 'starsync']);
			// totalSuggestions reflects what actually landed, not the model's raw batch.
			const cycle = (
				await db.select().from(directorCycles).where(eq(directorCycles.id, newCycleId))
			)[0];
			expect(cycle?.totalSuggestions).toBe(2);
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('user dismissals older than the dedup window do not suppress', async () => {
		const { commands, config, db, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const now = Date.now();
			const staleMs = 15 * 24 * 60 * 60 * 1000; // outside the 14-day window
			await db.insert(directorCycles).values([
				{ id: 'cycle_expired_old', startedAt: now - staleMs, status: 'completed' },
				{ id: 'cycle_expired_new', startedAt: now - 1000, status: 'running' },
			]);
			await db.insert(suggestions).values({
				createdAt: now - staleMs,
				cycleId: 'cycle_expired_old',
				description: 'd',
				dismissedBy: 'user',
				id: 'sug_expired',
				projectId: 'agentwatch',
				reasoning: 'r',
				resolvedAt: now - staleMs,
				riskLevel: 'LOW',
				status: 'dismissed',
				taskType: 'artifact_maintenance',
				title: 'agentwatch: reconcile aidd artifacts',
			});
			const privateApi = service as unknown as { chatService: DirectorChatService };
			const output: DirectorOutput = {
				fleetSummary: {
					byRisk: { HIGH: 0, LOW: 1, MEDIUM: 0 },
					byType: { artifact_maintenance: 1 },
					crossProjectPatterns: [],
					totalSuggestions: 1,
				},
				suggestions: [
					makeSuggestion({
						projectId: 'agentwatch',
						taskType: 'artifact_maintenance',
						title: 'agentwatch: reconcile aidd artifacts',
					}),
				],
			};
			await persistCycleResult(
				{
					chatService: privateApi.chatService,
					commands,
					db,
					getConfig: () => config,
					hub: new WebSocketHub(),
				},
				'cycle_expired_new',
				{ fleetAggregations: { fleetHealthScore: 75 } } as FleetSummary,
				output,
				0,
				'ok',
			);
			const pending = (await db.select().from(suggestions)).filter(
				(row) => row.status === 'pending',
			);
			expect(pending).toHaveLength(1);
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});
});

describe('DirectorService chat and profile', () => {
	test('saves profile settings and persists a read-only assistant reply', async () => {
		const {
			commands,
			config,
			db,
			hub,
			projectService,
			rootDir,
			runService,
			sqlite,
			workspace,
		} = await makeWorkspace();
		try {
			const captured: PromptInput[] = [];
			const chatService = new DirectorService(
				config,
				db,
				commands,
				hub,
				projectService,
				runService,
				() => fakeBackend('Use Codex for broad repo triage.', captured),
			);
			const profile = await chatService.updateProfile({
				backend: 'native',
				instructions: 'Favor high-risk fleet drift first.',
				model: 'coord-model',
				reasoningEffort: 'high',
				role: 'Fleet Strategist',
			});
			expect(profile).toMatchObject({
				backend: 'native',
				instructions: 'Favor high-risk fleet drift first.',
				model: 'coord-model',
				reasoningEffort: 'high',
				role: 'Fleet Strategist',
			});
			const session = await chatService.createChatSession();
			const result = await chatService.sendChatMessage(session.id, {
				content: 'Prioritize drift in aidd and spernakit.',
			});
			expect(result.user.role).toBe('user');
			expect(result.assistant.role).toBe('assistant');
			expect(result.assistant.content).toContain('Codex');
			expect(captured[0]?.cwd).toContain('chat-work');
			expect(captured[0]?.model).toBe('coord-model');
			expect(captured[0]?.text).toContain('Favor high-risk fleet drift first.');
			const messages = await chatService.listChatMessages(session.id);
			expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('stores user and assistant messages from direct AI chat when enabled', async () => {
		const {
			commands,
			config,
			db,
			hub,
			projectService,
			rootDir,
			runService,
			sqlite,
			workspace,
		} = await makeWorkspace();
		try {
			const direct = directAiRunner('Direct director reply.');
			const chatService = new DirectorService(
				config,
				db,
				commands,
				hub,
				projectService,
				runService,
				() => {
					throw new Error('backend should not launch');
				},
				direct.runner,
			);
			const session = await chatService.createChatSession();
			const result = await chatService.sendChatMessage(session.id, {
				content: 'What should the next cycle do?',
			});

			expect(result.user.content).toBe('What should the next cycle do?');
			expect(result.assistant.content).toBe('Direct director reply.');
			expect(direct.calls).toHaveLength(1);
			expect(direct.calls[0]).toContain('What should the next cycle do?');
			const messages = await chatService.listChatMessages(session.id);
			expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('deletes chat sessions and cascades their messages', async () => {
		const {
			commands,
			config,
			db,
			hub,
			projectService,
			rootDir,
			runService,
			sqlite,
			workspace,
		} = await makeWorkspace();
		try {
			const chatService = new DirectorService(
				config,
				db,
				commands,
				hub,
				projectService,
				runService,
				() => fakeBackend('reply'),
			);
			const session = await chatService.createChatSession('Old chat');
			await chatService.sendChatMessage(session.id, { content: 'Archive this context.' });

			await chatService.deleteChatSession(session.id);

			const sessionRows = await db
				.select()
				.from(directorChatSessions)
				.where(eq(directorChatSessions.id, session.id));
			const messageRows = await db
				.select()
				.from(directorChatMessages)
				.where(eq(directorChatMessages.sessionId, session.id));
			expect(sessionRows).toHaveLength(0);
			expect(messageRows).toHaveLength(0);
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('rejects director chat turns that report file modifications', async () => {
		const {
			commands,
			config,
			db,
			hub,
			projectService,
			rootDir,
			runService,
			sqlite,
			workspace,
		} = await makeWorkspace();
		try {
			const chatService = new DirectorService(
				config,
				db,
				commands,
				hub,
				projectService,
				runService,
				() => fakeBackend('changed files', [], ['cli/src/index.ts']),
			);
			const session = await chatService.createChatSession();
			expect(
				chatService.sendChatMessage(session.id, { content: 'Change the repo.' }),
			).rejects.toThrow(/attempted to modify files/);
			await Bun.sleep(10);
			const messages = await chatService.listChatMessages(session.id);
			// The user message is persisted, plus a system error message explaining
			// why no assistant reply was generated.
			expect(messages).toHaveLength(2);
			expect(messages[0]?.role).toBe('user');
			expect(messages[1]?.role).toBe('system');
			expect(messages[1]?.content).toContain('attempted to modify files');
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('persists user message and system error when chat turn fails with no provider', async () => {
		const {
			commands,
			config,
			db,
			hub,
			projectService,
			rootDir,
			runService,
			sqlite,
			workspace,
		} = await makeWorkspace();
		try {
			// Use a backend factory that throws so the chat turn fails — simulating
			// the common scenario where no provider is configured.
			const chatService = new DirectorService(
				config,
				db,
				commands,
				hub,
				projectService,
				runService,
				() => {
					throw new Error('No provider configured.');
				},
				disabledDirectAiRunner,
			);
			const session = await chatService.createChatSession();
			await expect(
				chatService.sendChatMessage(session.id, { content: 'Hello director.' }),
			).rejects.toThrow();

			const messages = await chatService.listChatMessages(session.id);
			// The user message must be persisted and visible, plus a system error
			// message explaining why no assistant reply was generated.
			expect(messages).toHaveLength(2);
			expect(messages[0]?.role).toBe('user');
			expect(messages[0]?.content).toBe('Hello director.');
			expect(messages[1]?.role).toBe('system');
			expect(messages[1]?.content).toContain('Could not generate a reply');
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});
});

describe('DirectorService priority health', () => {
	test('orders prioritized work by director priority buckets and gates fleet health', async () => {
		const { projectDir, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const artifactProject = join(workspace, 'artifact-project');
			const auditProject = join(workspace, 'audit-project');
			const remediationProject = join(workspace, 'remediation-project');
			const featureProject = join(workspace, 'feature-project');
			for (const dir of [artifactProject, auditProject, remediationProject, featureProject]) {
				await mkdir(join(dir, '.aidd'), { recursive: true });
				await writeArtifactCheck(dir);
			}
			await writeArtifactCheck(projectDir);
			await writeArtifactCheck(artifactProject, {
				fresh: 7,
				missing: 1,
				present: 7,
				requiredMissing: 1,
			});
			await writeFeature(auditProject, 'audit-security-100-high-risk', {
				auditSeverity: 'High',
				auditSource: 'SECURITY',
			});
			await writeFeature(remediationProject, 'remediation-fix-runtime');
			await writeFeature(featureProject, 'feature-core-work');

			const summary = await service.getFleetSummary();

			expect(summary.fleetAggregations.priorityHealth).toMatchObject({
				band: 'artifact_unhealthy',
				primaryTaskType: 'artifact_maintenance',
			});
			expect(summary.fleetAggregations.fleetHealthScore).toBeLessThanOrEqual(40);
			expect(summary.prioritizedWork.map((item) => item.taskType).slice(0, 4)).toEqual([
				'artifact_maintenance',
				'audit_backlog',
				'remediation_backlog',
				'feature_completion',
			]);
			const artifactItem = summary.prioritizedWork.find(
				(item) => item.taskType === 'artifact_maintenance',
			);
			expect(artifactItem?.suggestedRecipe).toBe('reconcile-project-artifacts');
			expect(artifactItem?.suggestedArgs).toBeNull();
			const auditRow = summary.projects.find((project) => project.slug === 'audit-project');
			expect(auditRow?.priorityHealth).toMatchObject({
				band: 'audit_backlog',
				primaryTaskType: 'audit_backlog',
			});
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('places audit report freshness after remediation backlog', async () => {
		const { rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const auditFreshnessProject = join(workspace, 'audit-freshness-project');
			const remediationProject = join(workspace, 'remediation-project');
			for (const dir of [auditFreshnessProject, remediationProject]) {
				await mkdir(join(dir, '.aidd'), { recursive: true });
				await writeArtifactCheck(dir);
			}
			await mkdir(join(auditFreshnessProject, '.aidd', 'audits'), { recursive: true });
			await Bun.write(
				join(auditFreshnessProject, '.aidd', 'audits', 'SECURITY.md'),
				'# Security\n',
			);
			await writeFeature(remediationProject, 'remediation-fix-runtime');

			const summary = await service.getFleetSummary();
			const taskTypes = summary.prioritizedWork.map((item) => item.taskType);

			expect(taskTypes.indexOf('remediation_backlog')).toBeLessThan(
				taskTypes.indexOf('audit_maintenance'),
			);
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('audit maintenance includes reports made stale by committed source changes', async () => {
		const { rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const projectDir = join(workspace, 'code-stale-audit-project');
			await mkdir(join(projectDir, '.aidd', 'audits'), { recursive: true });
			await writeArtifactCheck(projectDir);
			await writeProjectProfile(projectDir);
			await Bun.write(
				join(projectDir, '.aidd', 'audits', 'CODE_QUALITY.md'),
				'# Code Quality\n',
			);
			await initGitProject(projectDir);
			const store = new FileAiddStore(projectDir);
			await store.writeAuditReport('CODE_QUALITY', '# CODE_QUALITY done');
			for (let index = 0; index < 10; index++) {
				await commitSourceFile(
					projectDir,
					`src/change-${index}.ts`,
					`export const change${index} = ${index};\n`,
				);
			}

			const summary = await service.getFleetSummary();
			const project = summary.projects.find(
				(candidate) => candidate.slug === 'code-stale-audit-project',
			);
			const work = summary.prioritizedWork.find(
				(item) => item.projectId === 'code-stale-audit-project',
			);

			expect(project?.auditHealth.stale[0]).toMatchObject({
				name: 'CODE_QUALITY',
				reasons: ['code_commits'],
			});
			expect(work?.taskType).toBe('audit_maintenance');
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('downgrades local-only audit backlog and exposes profile evidence', async () => {
		const { projectDir, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const localProject = join(workspace, 'local-project');
			await mkdir(join(localProject, '.aidd'), { recursive: true });
			await writeArtifactCheck(projectDir);
			await writeArtifactCheck(localProject);
			await writeProjectProfile(localProject);
			await writeFeature(localProject, 'audit-security-100-local-hardening', {
				auditSeverity: 'High',
				auditSource: 'SECURITY',
			});

			const summary = await service.getFleetSummary();
			const item = summary.prioritizedWork.find(
				(work) => work.projectId === 'local-project' && work.taskType === 'audit_backlog',
			);

			expect(item?.riskLevel).toBe('MEDIUM');
			// This freshly-scaffolded project has not reached the 'engaged' maturity stage, so the
			// profile downgrade composes with the maturity deferral (which keeps MEDIUM as-is here).
			expect(item?.evidence).toMatchObject({
				maturityDeferred: true,
				profile: { bucket: 'single_user_local', source: 'explicit' },
				profileAdjustment: 'local_high_downgraded+deferred_premature_maturity',
			});
			expect(item?.reason).toContain('single-user local profile');
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('escalates audit backlog for public multi-tenant profiles but defers while immature', async () => {
		const { projectDir, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const publicProject = join(workspace, 'public-project');
			await mkdir(join(publicProject, '.aidd'), { recursive: true });
			await writeArtifactCheck(projectDir);
			await writeArtifactCheck(publicProject);
			await writeProjectProfile(publicProject, {
				authMode: 'tenant_rbac',
				bucket: 'public_multi_tenant',
				criticality: 'business_critical',
				dataSensitivity: 'regulated',
				deployment: 'cloud',
				externalIntegrations: 'financial_or_security',
			});
			await writeFeature(publicProject, 'audit-security-100-medium-public', {
				auditSeverity: 'Medium',
				auditSource: 'SECURITY',
			});

			const summary = await service.getFleetSummary();
			const item = summary.prioritizedWork.find(
				(work) => work.projectId === 'public-project' && work.taskType === 'audit_backlog',
			);

			// The profile escalates audit hardening, but this scaffold has not reached the
			// 'engaged' maturity stage, so the director caps the surfaced risk at MEDIUM
			// (defer, not suppress) until the app is built out. The escalation adjustment is
			// preserved in the evidence so the reason stays explainable.
			expect(item?.riskLevel).toBe('MEDIUM');
			expect(item?.evidence).toMatchObject({
				maturityDeferred: true,
				profile: { bucket: 'public_multi_tenant', source: 'explicit' },
				profileAdjustment: 'escalated_full_hardening+deferred_premature_maturity',
			});
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('audit maintenance uses profile-applicable audit definitions', async () => {
		const { projectDir, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			const localProject = join(workspace, 'local-audit-maintenance-project');
			await mkdir(join(localProject, '.aidd', 'audits'), { recursive: true });
			await mkdir(join(rootDir, 'audits'), { recursive: true });
			await Bun.write(
				join(rootDir, 'audits', 'audit-profile-mapping.json'),
				`${JSON.stringify({
					rules: [
						{
							audits: ['DEVOPS'],
							effect: 'disabled',
							id: 'local-skip-devops',
							match: {
								bucket: ['single_user_local'],
								criticality: ['toy', 'utility'],
								dataSensitivity: ['none', 'low'],
								deployment: ['local'],
								externalIntegrations: ['none', 'read_only'],
							},
						},
					],
					version: 1,
				})}\n`,
			);
			await writeArtifactCheck(projectDir);
			await writeArtifactCheck(localProject);
			await writeProjectProfile(localProject);
			await Bun.write(join(localProject, '.aidd', 'audits', 'CODE_QUALITY.md'), '# Code\n');
			await Bun.write(join(localProject, '.aidd', 'audits', 'DEVOPS.md'), '# DevOps\n');

			const summary = await service.getFleetSummary();
			const project = summary.projects.find(
				(candidate) => candidate.slug === 'local-audit-maintenance-project',
			);

			expect(project?.auditHealth.missing).toEqual(['CODE_QUALITY']);
			expect(project?.auditHealth.missing).not.toContain('DEVOPS');
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});
});

describe('DirectorService.runCycle context', () => {
	test('direct cycle persists normalized suggestions without creating a run row', async () => {
		const {
			commands,
			config,
			db,
			hub,
			projectDir,
			projectService,
			rootDir,
			runService,
			sqlite,
			workspace,
		} = await makeWorkspace();
		try {
			await writeArtifactCheck(projectDir);
			config.directAi = {
				enabled: true,
				surfaces: {
					directorChat: false,
					directorCycle: true,
					projectAdvisor: false,
					runSummaries: false,
				},
				timeoutSeconds: 45,
			};
			const direct = directAiRunner(
				JSON.stringify({
					fleetSummary: {
						byRisk: { HIGH: 1, LOW: 0, MEDIUM: 0 },
						byType: { audit_backlog: 1 },
						crossProjectPatterns: ['Audit backlog is the fleet priority.'],
						totalSuggestions: 1,
					},
					suggestions: [
						{
							confidence: 0.9,
							description: 'Review the open audit backlog.',
							evidence: { source: 'fleet-summary' },
							projectId: 'sample-project',
							reasoning: 'The project has audit work that should be scheduled.',
							riskLevel: 'HIGH',
							suggestedArgs: { audit: 'SECURITY' },
							suggestedRecipe: null,
							taskType: 'audit_backlog',
							title: 'Review security audit backlog',
						},
					],
				}),
			);
			const cycleService = new DirectorService(
				config,
				db,
				commands,
				hub,
				projectService,
				runService,
				() => {
					throw new Error('backend should not launch');
				},
				direct.runner,
			);
			await cycleService.updateProfile({
				backend: 'native',
				instructions: '',
				model: 'director-model',
				reasoningEffort: 'high',
				role: 'Fleet Director',
			});

			const result = await cycleService.runCycle();

			expect(result.output?.suggestions).toHaveLength(1);
			expect(result.output?.fleetSummary.totalSuggestions).toBe(1);
			const runRows = await db
				.select()
				.from(runs)
				.where(eq(runs.directorCycleId, result.cycleId));
			expect(runRows).toHaveLength(0);
			const suggestionRows = await db
				.select()
				.from(suggestions)
				.where(eq(suggestions.cycleId, result.cycleId));
			expect(suggestionRows).toHaveLength(1);
			expect(suggestionRows[0]?.title).toBe('Review security audit backlog');
			expect(suggestionRows[0]?.suggestedArgs).toBe('{"audit":"SECURITY"}');
			const cycle = (
				await db.select().from(directorCycles).where(eq(directorCycles.id, result.cycleId))
			)[0];
			expect(cycle?.status).toBe('completed');
			expect(cycle?.totalSuggestions).toBe(1);
			const outputPath = join(
				config.web.dataDir,
				'director',
				`${result.cycleId}-output.json`,
			);
			expect(await Bun.file(outputPath).exists()).toBe(true);
			expect(direct.calls[0]).toContain('sample-project');
			expect(direct.metaCalls).toEqual([
				{ model: 'director-model', reasoningEffort: 'high' },
			]);
			expect(direct.requests[0]?.model).toBe('director-model');
			expect(direct.requests[0]?.reasoningEffort).toBe('high');
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('omits context for empty cycle requests and adds profile/chat context when supplied', async () => {
		const cycleCliScript = `${directorOutputWriter()}${heartbeatTerminator({ mode: 'director' })}`;
		const {
			commands,
			config,
			db,
			hub,
			projectDir,
			projectService,
			rootDir,
			runService,
			sqlite,
			workspace,
		} = await makeWorkspace(cycleCliScript);
		try {
			const captured: PromptInput[] = [];
			const cycleService = new DirectorService(
				config,
				db,
				commands,
				hub,
				projectService,
				runService,
				() => fakeBackend('chat reply', captured),
			);
			// projectDir is created on disk by makeWorkspace; the cycle picks the first
			// project under allowed roots as its host project for the launched CLI.
			expect(projectDir).toContain('sample-project');

			const result1 = await cycleService.runCycle();
			const context1Path = join(
				config.web.dataDir,
				'director',
				`${result1.cycleId}-context.json`,
			);
			expect(await Bun.file(context1Path).exists()).toBe(false);
			const run1 = (
				await db.select().from(runs).where(eq(runs.directorCycleId, result1.cycleId))
			)[0];
			expect(run1?.source).toBe('director');
			expect(run1?.mode).toBe('director');
			expect(run1?.projectName).toBe('Director');
			expect(run1?.model).toBe('glm-5.2');
			expect(run1?.provider).toBe('zhipu');
			expect(run1?.reasoningEffort).toBe('low');

			await cycleService.updateProfile({
				backend: 'native',
				instructions: 'Favor director chat context.',
				model: 'cycle-model',
				reasoningEffort: 'medium',
				role: 'Cycle Overseer',
			});
			const session = await cycleService.createChatSession();
			await cycleService.sendChatMessage(session.id, { content: 'Focus on aidd first.' });
			const result2 = await cycleService.runCycle({
				directive: 'Generate one focused suggestion.',
				sessionId: session.id,
			});

			const context2Path = join(
				config.web.dataDir,
				'director',
				`${result2.cycleId}-context.json`,
			);
			expect(await Bun.file(context2Path).exists()).toBe(true);
			const context2Doc = JSON.parse(await Bun.file(context2Path).text()) as {
				directive: string | null;
				profile: {
					instructions: string;
					model: string | null;
					reasoningEffort: string;
					role: string;
				};
				recentMessages: { role: string; content: string }[];
				sessionId: string | null;
			};
			expect(context2Doc.directive).toBe('Generate one focused suggestion.');
			expect(context2Doc.profile.role).toBe('Cycle Overseer');
			expect(context2Doc.profile.instructions).toBe('Favor director chat context.');
			expect(context2Doc.profile.model).toBe('cycle-model');
			expect(context2Doc.profile.reasoningEffort).toBe('medium');
			expect(context2Doc.sessionId).toBe(session.id);
			expect(context2Doc.recentMessages.some((message) => message.role === 'user')).toBe(
				true,
			);

			const run2 = (
				await db.select().from(runs).where(eq(runs.directorCycleId, result2.cycleId))
			)[0];
			expect(run2?.backend).toBe('native');
			expect(run2?.projectName).toBe('Director');
			expect(run2?.model).toBe('cycle-model');
			expect(run2?.provider).toBe('zhipu');
			expect(run2?.reasoningEffort).toBe('medium');

			const messages = await cycleService.listChatMessages(session.id);
			expect(messages.some((message) => message.role === 'system')).toBe(true);
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	}, 20000);
});

describe('normalizeDirectDirectorOutput dedup', () => {
	test('deduplicates suggestions by projectId + taskType', async () => {
		const { normalizeDirectDirectorOutput } =
			await import('../../backend/src/services/director/directCycleNormalizer.ts');
		const fleetSummary = {
			fleetAggregations: { fleetHealthScore: 75 },
		} as FleetSummary;
		const raw = {
			fleetSummary: {
				byRisk: { HIGH: 0, LOW: 0, MEDIUM: 0 },
				byType: {},
				totalSuggestions: 0,
			},
			suggestions: [
				{
					description: 'd',
					evidence: {},
					projectId: 'proj-a',
					reasoning: 'r',
					riskLevel: 'MEDIUM',
					taskType: 'audit_remediation',
					title: 'First',
				},
				{
					description: 'd',
					evidence: {},
					projectId: 'proj-a',
					reasoning: 'r',
					riskLevel: 'HIGH',
					taskType: 'audit_remediation',
					title: 'Duplicate',
				},
				{
					description: 'd',
					evidence: {},
					projectId: 'proj-a',
					reasoning: 'r',
					riskLevel: 'LOW',
					taskType: 'dependency_hygiene',
					title: 'Different type',
				},
				{
					description: 'd',
					evidence: {},
					projectId: 'proj-b',
					reasoning: 'r',
					riskLevel: 'MEDIUM',
					taskType: 'audit_remediation',
					title: 'Different project',
				},
				{
					description: 'd',
					evidence: {},
					projectId: null,
					reasoning: 'r',
					riskLevel: 'LOW',
					taskType: 'stale_project',
					title: 'Fleet-wide first',
				},
				{
					description: 'd',
					evidence: {},
					projectId: null,
					reasoning: 'r',
					riskLevel: 'LOW',
					taskType: 'stale_project',
					title: 'Fleet-wide dup',
				},
			],
		};
		const result = normalizeDirectDirectorOutput(raw, fleetSummary);
		expect(result.suggestions).toHaveLength(4);
		expect(result.suggestions.map((s) => s.title).sort()).toEqual(
			['Different project', 'Different type', 'Fleet-wide first', 'First'].sort(),
		);
		expect(result.fleetSummary.totalSuggestions).toBe(4);
	});
});

describe('director API routes', () => {
	test('accepts empty cycle bodies and exposes profile/chat endpoints', async () => {
		const cycleInputs: unknown[] = [];
		const app = createDirectorRoutes({
			directorService: {
				async createChatSession() {
					return {
						createdAt: 1,
						id: 'session_1',
						profileId: 'default',
						title: 'Director Chat',
						updatedAt: 1,
					};
				},
				async deleteChatSession() {},
				async getProfile() {
					return {
						backend: 'native',
						createdAt: 1,
						id: 'default',
						instructions: '',
						model: null,
						reasoningEffort: 'low',
						role: 'Fleet Director',
						updatedAt: 1,
					};
				},
				async listChatMessages() {
					return [];
				},
				async listChatSessions() {
					return [];
				},
				async runCycle(input: unknown) {
					cycleInputs.push(input);
					return { cycleId: 'cycle_1', output: undefined };
				},
				async sendChatMessage() {
					return {
						assistant: {
							content: 'reply',
							createdAt: 2,
							cycleId: null,
							id: 'msg_2',
							role: 'assistant',
							sessionId: 'session_1',
						},
						user: {
							content: 'hello',
							createdAt: 1,
							cycleId: null,
							id: 'msg_1',
							role: 'user',
							sessionId: 'session_1',
						},
					};
				},
				async updateProfile() {
					return {
						backend: 'codex',
						createdAt: 1,
						id: 'default',
						instructions: 'focus',
						model: 'gpt',
						reasoningEffort: 'high',
						role: 'Strategist',
						updatedAt: 2,
					};
				},
			},
		} as unknown as WebContext);

		const emptyCycle = await app.handle(
			new Request('http://localhost/api/v1/director/cycles', { method: 'POST' }),
		);
		expect(emptyCycle.status).toBe(200);
		expect(cycleInputs[0]).toEqual({});

		const contextCycle = await app.handle(
			new Request('http://localhost/api/v1/director/cycles', {
				body: JSON.stringify({ directive: 'focus', sessionId: 'session_1' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			}),
		);
		expect(contextCycle.status).toBe(200);
		expect(cycleInputs[1]).toEqual({ directive: 'focus', sessionId: 'session_1' });

		const chat = await app.handle(
			new Request('http://localhost/api/v1/director/chat/sessions/session_1/messages', {
				body: JSON.stringify({ content: 'hello' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			}),
		);
		expect(chat.status).toBe(200);

		const deletedChat = await app.handle(
			new Request('http://localhost/api/v1/director/chat/sessions/session_1', {
				method: 'DELETE',
			}),
		);
		expect(deletedChat.status).toBe(200);
	});
});

describe('DirectorService.launchSuggestion', () => {
	test('rejects fleet-wide suggestions (projectId null) without invoking RunService', async () => {
		const { db, rootDir, service, sqlite, workspace } = await makeWorkspace();
		try {
			await seedSuggestion(db, { id: 'sug_fleet', projectId: null });

			expect(service.launchSuggestion('sug_fleet')).rejects.toThrow(
				/Fleet-wide suggestions cannot be launched directly/,
			);

			const row = (
				await db.select().from(suggestions).where(eq(suggestions.id, 'sug_fleet'))
			)[0];
			expect(row?.projectId).toBeNull();
			expect(row?.status).toBe('pending');
			expect(row?.launchedRunId).toBeNull();
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('launches project-scoped suggestions and records the run id', async () => {
		const { db, projectDir, rootDir, runService, service, sqlite, workspace } =
			await makeWorkspace(heartbeatTerminator());
		try {
			const projectSlug = projectDir.split(/[\\/]/).pop()!;
			await seedSuggestion(db, { id: 'sug_proj', projectId: projectSlug });

			const launch = await service.launchSuggestion('sug_proj');

			expect(launch.kind).toBe('run');
			if (launch.kind !== 'run') throw new Error('Expected a run launch.');
			expect(launch.runId).toMatch(/^run_/);
			const row = (
				await db.select().from(suggestions).where(eq(suggestions.id, 'sug_proj'))
			)[0];
			expect(row?.status).toBe('launched');
			expect(row?.launchedRunId).toBe(launch.runId);
			expect(row?.launchedPipelineSessionId).toBeNull();
			const launchedRun = await runService.getRun(launch.runId);
			expect(launchedRun?.projectPath).toBe(projectDir);

			const deadline = Date.now() + 5000;
			while (Date.now() < deadline) {
				const current = await runService.getRun(launch.runId);
				if (current && current.status !== 'running') break;
				await Bun.sleep(25);
			}
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('launches a recipe-backed suggestion as a pipeline with its targeting args', async () => {
		const { db, hub, projectDir, projectService, rootDir, runService, sqlite, workspace } =
			await makeWorkspace();
		try {
			const projectSlug = projectDir.split(/[\\/]/).pop()!;
			await seedSuggestion(db, {
				id: 'sug_recipe',
				projectId: projectSlug,
				suggestedArgs: JSON.stringify({ feature: 'archive-cli-command-suite' }),
				suggestedRecipe: 'coding',
			});
			let launchedParameters: Record<string, string> | undefined;
			const suggestionService = new DirectorSuggestionService(
				db,
				hub,
				projectService,
				runService,
				{
					findRecipeByName: async () => ({
						id: 'coding',
						name: 'coding',
						parameters: [],
						steps: [
							{
								configJson: {},
								id: 'coding_step_1',
								name: 'Run coding',
								stepType: 'aidd-cli',
							},
						],
					}),
					launchRecipe: async (input) => {
						launchedParameters = input.parameters;
						await db.insert(pipelineSessions).values({
							currentStepIndex: 0,
							id: 'pipe_recipe',
							parametersJson: JSON.stringify(input.parameters),
							projectName: projectSlug,
							projectPath: projectDir,
							recipeId: input.recipeId,
							recipeName: 'coding',
							startedAt: Date.now(),
							status: 'queued',
							totalSteps: 1,
						});
						return {
							completedAt: null,
							currentStepIndex: 0,
							durationMs: null,
							errorMessage: null,
							id: 'pipe_recipe',
							parametersJson: JSON.stringify(input.parameters),
							projectName: projectSlug,
							projectPath: projectDir,
							recipeId: input.recipeId,
							recipeName: 'coding',
							startedAt: Date.now(),
							status: 'queued',
							totalSteps: 1,
						};
					},
				},
			);

			const launch = await suggestionService.launchSuggestion('sug_recipe');

			expect(launch).toEqual({ kind: 'pipeline', pipelineSessionId: 'pipe_recipe' });
			expect(launchedParameters).toEqual({ feature: 'archive-cli-command-suite' });
			const row = (
				await db.select().from(suggestions).where(eq(suggestions.id, 'sug_recipe'))
			)[0];
			expect(row?.launchedPipelineSessionId).toBe('pipe_recipe');
			expect(row?.launchedRunId).toBeNull();
			expect(row?.status).toBe('launched');
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('releases the launch claim when a suggested recipe is missing', async () => {
		const { db, hub, projectDir, projectService, rootDir, runService, sqlite, workspace } =
			await makeWorkspace();
		try {
			const projectSlug = projectDir.split(/[\\/]/).pop()!;
			await seedSuggestion(db, {
				id: 'sug_missing_recipe',
				projectId: projectSlug,
				suggestedRecipe: 'invented-recipe',
			});
			const suggestionService = new DirectorSuggestionService(
				db,
				hub,
				projectService,
				runService,
				{
					findRecipeByName: async () => undefined,
					launchRecipe: async () => {
						throw new Error('launchRecipe must not run');
					},
				},
			);

			expect(suggestionService.launchSuggestion('sug_missing_recipe')).rejects.toThrow(
				'Suggested recipe not found: invented-recipe',
			);
			const row = (
				await db.select().from(suggestions).where(eq(suggestions.id, 'sug_missing_recipe'))
			)[0];
			expect(row?.status).toBe('pending');
			expect(row?.launchedPipelineSessionId).toBeNull();
			expect(row?.launchedRunId).toBeNull();
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('fires two concurrent launches for one pending suggestion and spawns exactly one run', async () => {
		const { db, projectDir, rootDir, runService, service, sqlite, workspace } =
			await makeWorkspace(heartbeatTerminator());
		try {
			const projectSlug = projectDir.split(/[\\/]/).pop()!;
			await seedSuggestion(db, { id: 'sug_race', projectId: projectSlug });

			const outcomes = await Promise.allSettled([
				service.launchSuggestion('sug_race'),
				service.launchSuggestion('sug_race'),
			]);
			const fulfilled = outcomes.filter(
				(
					outcome,
				): outcome is PromiseFulfilledResult<
					Awaited<ReturnType<typeof service.launchSuggestion>>
				> => outcome.status === 'fulfilled',
			);
			const rejected = outcomes.filter(
				(outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
			);

			// The compare-and-set guard lets exactly one caller win; the other observes a
			// non-pending row and throws instead of spawning a second run.
			expect(fulfilled).toHaveLength(1);
			expect(rejected).toHaveLength(1);
			expect((rejected[0]!.reason as Error).message).toContain('no longer pending');

			const winningLaunch = fulfilled[0]!.value;
			expect(winningLaunch.kind).toBe('run');
			if (winningLaunch.kind !== 'run') throw new Error('Expected a run launch.');
			const row = (
				await db.select().from(suggestions).where(eq(suggestions.id, 'sug_race'))
			)[0];
			expect(row?.status).toBe('launched');
			expect(row?.launchedRunId).toBe(winningLaunch.runId);

			// Only one run row was ever created for the suggestion.
			const runRows = await db.select().from(runs);
			expect(runRows).toHaveLength(1);
			expect(runRows[0]!.id).toBe(winningLaunch.runId);

			const deadline = Date.now() + 5000;
			while (Date.now() < deadline) {
				const current = await runService.getRun(winningLaunch.runId);
				if (current && current.status !== 'running') break;
				await Bun.sleep(25);
			}
		} finally {
			sqlite.close();
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});
});
