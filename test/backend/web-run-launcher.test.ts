import { Database } from 'bun:sqlite';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Elysia } from 'elysia';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { HttpError } from '../../backend/src/services/errors.ts';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import { wrapWebDatabase, type WebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import * as schema from '../../backend/src/db/schema.ts';
import { buildLaunchCommand } from '../../backend/src/services/runLauncher.ts';
import {
	buildDetachedRunSpawnPlan,
	buildHiddenStartProcessCommand,
} from '../../backend/src/services/run/detachedSpawnPlan.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import { RecipeService } from '../../backend/src/services/recipeService.ts';
import { RunControlError, RunService } from '../../backend/src/services/runService.ts';
import { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';
import { createRunsRoutes } from '../../backend/src/routes/runs.ts';
import type { WebContext } from '../../backend/src/context.ts';
import type { RunLaunchRequest } from '../../backend/src/types.ts';
import {
	activeRunsDir,
	readCliActiveRunRecords,
	writeCliActiveRunRecord,
	type CliActiveRunRecord,
} from 'aidd-shared/metadata/active-runs';
import { createFeatureLeaseService } from 'aidd-shared/metadata/feature-leases';
import {
	heartbeatTerminator,
	logWriter,
	writeFakeCliEntrypoint,
} from './_helpers/heartbeat-stub.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
function wait(ms: number): Promise<void> {
	return Bun.sleep(ms);
}

async function waitFor<T>(
	read: () => Promise<T | undefined>,
	predicate: (value: T) => boolean
): Promise<T> {
	const startedAt = Date.now();
	for (;;) {
		const value = await read();
		if (value !== undefined && predicate(value)) return value;
		if (Date.now() - startedAt > 5000) throw new Error('Timed out waiting for run state');
		await wait(25);
	}
}

// The reap paths resolve leases through git's common dir, so the fixture project must be a
// real repository for lease assertions to exercise anything.
async function gitInitRepo(dir: string): Promise<void> {
	await mkdir(dir, { recursive: true });
	const proc = Bun.spawn(['git', 'init', dir], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) {
		throw new Error(`git init failed: ${await new Response(proc.stderr).text()}`);
	}
}

function leaseServiceFor(projectDir: string, runId: string) {
	return createFeatureLeaseService({ pid: process.pid, projectDir, runId });
}

async function makeProject(root: string): Promise<string> {
	const projectDir = join(root, 'sample-project');
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await Bun.write(join(projectDir, '.aidd', 'spec.md'), '# Sample\n');
	return projectDir;
}

function makeCliActiveRun(projectDir: string, id: string): CliActiveRunRecord {
	const now = Date.now();
	return {
		aiddDirty: null,
		aiddRevision: null,
		aiddVersion: null,
		aiSummary: null,
		backend: 'native',
		cachedTokens: null,
		commandArgs: null,
		completedAt: null,
		durationMs: null,
		exitCode: null,
		filesChanged: null,
		heartbeatAt: now,
		id,
		inputTokens: null,
		linesAdded: null,
		linesRemoved: null,
		logPath: null,
		mode: 'coding',
		model: null,
		outputTokens: null,
		pid: 12345,
		projectName: 'sample-project',
		projectPath: projectDir,
		provider: null,
		reasoningEffort: null,
		reasoningTokens: null,
		source: 'cli',
		startedAt: now - 1000,
		state: 'run_agent',
		stopFile: join(projectDir, '.aidd', '.stop'),
		stopReason: null,
		summary: null,
	};
}

async function makeLauncherRoot(script: string): Promise<string> {
	const root = await testTempDir('aidd-web-launcher-root-');
	await writeFakeCliEntrypoint(root, script);
	await Bun.write(join(root, 'VERSION'), 'test-version\n');
	return root;
}

function makeConfig(web: ResolvedWebConfig): ResolvedConfig & { web: ResolvedWebConfig } {
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

function makeService(input: {
	allowedRoot: string;
	config?: Partial<ResolvedConfig>;
	dataDir: string;
	rootDir: string;
	webSocketMessages?: string[];
}): { service: RunService; sqlite: Database; web: ResolvedWebConfig } {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	const hub = new WebSocketHub();
	if (input.webSocketMessages) {
		hub.add({ send: (data) => input.webSocketMessages?.push(data) });
	}
	const web = {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [input.allowedRoot],
		dataDir: input.dataDir,
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3210,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: true,
	};
	const { db, commands } = wrapWebDatabase(sqlite);
	const config = { ...makeConfig(web), ...input.config, web };
	return {
		service: new RunService(
			config,
			db,
			commands,
			hub,
			new ProjectService(web),
			input.rootDir,
			new TelemetryService({ commands, db })
		),
		sqlite,
		web,
	};
}

describe('web run launcher', () => {
	test('Windows detached run spawn plan uses hidden PowerShell bridge without cmd/start', () => {
		const plan = buildDetachedRunSpawnPlan({
			args: ['bun', 'cli/src/index.ts', '--project-dir', 'd:/applications/aidd'],
			launcherPrefix: ['bun', 'cli/src/index.ts'],
			logPath: 'd:/applications/aidd/data/run-logs/run_demo.log',
			payloadPath: 'd:/applications/aidd/data/run-logs/run_demo.launch.json',
			platform: 'win32',
			rootDir: 'd:/applications/aidd',
			runId: 'run_demo',
			source: 'web',
		});

		expect(plan.args.slice(0, 5)).toEqual([
			'pwsh',
			'-NoProfile',
			'-NonInteractive',
			'-WindowStyle',
			'Hidden',
		]);
		expect(plan.args).toContain('-EncodedCommand');
		expect(plan.args).not.toContain('cmd.exe');
		expect(plan.args).not.toContain('start');
		expect(plan.args).not.toContain('/b');
		expect(plan.options).toMatchObject({
			cwd: 'd:/applications/aidd',
			stderr: 'ignore',
			stdin: 'ignore',
			stdout: 'ignore',
			windowsHide: true,
		});
		expect(plan.recordPid).toBeNull();
		// The relauncher opens the run log itself; no fd crosses the detached hop.
		expect(plan.stderrLogPath).toBeNull();
	});

	test('POSIX detached run spawn plan runs the CLI directly and appends stderr to the run log', () => {
		const plan = buildDetachedRunSpawnPlan({
			args: ['bun', 'cli/src/index.ts', '--project-dir', '/srv/aidd'],
			launcherPrefix: ['bun', 'cli/src/index.ts'],
			logPath: '/srv/aidd/data/run-logs/run_demo.log',
			payloadPath: null,
			platform: 'linux',
			rootDir: '/srv/aidd',
			runId: 'run_demo',
			source: 'web',
		});

		expect(plan.args).toEqual(['bun', 'cli/src/index.ts', '--project-dir', '/srv/aidd']);
		// Early-startup crashes (before the first heartbeat) must land in the run log.
		expect(plan.stderrLogPath).toBe('/srv/aidd/data/run-logs/run_demo.log');
		expect(plan.recordPid).toBeUndefined();
		expect(plan.options).toMatchObject({
			cwd: '/srv/aidd',
			stdin: 'ignore',
			stdout: 'ignore',
		});
	});

	test('hidden Start-Process command launches relauncher without shell metachar parsing', () => {
		const command = buildHiddenStartProcessCommand({
			args: ['bun', 'cli/src/index.ts', '--detached-spawn', 'run_demo.launch.json'],
			cwd: 'd:/applications/aidd',
			logPath: "d:/applications/aidd/data/run-logs/run_demo's.log",
		});

		expect(command).toContain('Start-Process -FilePath');
		expect(command).toContain('-WindowStyle Hidden');
		expect(command).toContain("'run_demo.launch.json'");
		expect(command).toContain("run_demo''s.log");
		expect(command).not.toContain('cmd.exe');
		expect(command).not.toContain(' /c ');
	});

	test('runs route can return project-scoped active supervisor rows', async () => {
		const globalRuns = Array.from({ length: 100 }, (_, index) => ({
			backend: 'native',
			canKill: true,
			canReadOutput: true,
			canStop: true,
			completedAt: null,
			durationMs: null,
			errorMessage: null,
			exitCode: null,
			id: `run_global_${index}`,
			logPath: null,
			mode: 'coding',
			model: null,
			pid: null,
			pipelineSessionId: null,
			projectName: 'other',
			projectPath: 'd:/applications/other',
			provider: null,
			reasoningEffort: null,
			source: 'web',
			startedAt: Date.now() - index,
			status: 'running',
		}));
		const projectRuns = [
			{
				backend: 'native',
				canKill: true,
				canReadOutput: true,
				canStop: true,
				completedAt: null,
				durationMs: null,
				errorMessage: null,
				exitCode: null,
				id: 'run_valley-app_1',
				logPath: null,
				mode: 'coding',
				model: null,
				pid: null,
				pipelineSessionId: null,
				projectName: 'valley-app',
				projectPath: 'd:/applications/valley-app',
				provider: null,
				reasoningEffort: null,
				source: 'web',
				startedAt: Date.now() - 200000,
				status: 'running',
			},
		];
		const app = createRunsRoutes({
			runService: {
				listRunsPage: async () => ({ items: globalRuns, nextCursor: null }),
				listRunsForProjectPage: async (projectPath: string) => ({
					items: projectPath === 'd:/applications/valley-app' ? projectRuns : [],
					nextCursor: null,
				}),
			},
		} as unknown as WebContext);

		const globalResponse = await app.handle(new Request('http://localhost/api/v1/runs'));
		expect(globalResponse.status).toBe(200);
		const globalBody = (await globalResponse.json()) as { runs: { id: string }[] };
		expect(globalBody.runs).toHaveLength(100);
		expect(globalBody.runs.some((run) => run.id === 'run_valley-app_1')).toBe(false);

		const scopedResponse = await app.handle(
			new Request(
				`http://localhost/api/v1/runs?projectPath=${encodeURIComponent('d:/applications/valley-app')}`
			)
		);
		expect(scopedResponse.status).toBe(200);
		const scopedBody = (await scopedResponse.json()) as { runs: { id: string }[] };
		expect(scopedBody.runs.map((run) => run.id)).toEqual(['run_valley-app_1']);
	});

	test('lists UI-supervised and CLI heartbeat runs for the same project', async () => {
		const workspace = await testTempDir('aidd-web-unified-runs-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const serviceInternals = service as unknown as { db: WebDatabase };
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: 'run_ui_1',
					logPath: join(workspace, 'data', 'run-logs', 'run_ui_1.log'),
					mode: 'coding',
					projectName: 'sample-project',
					projectPath: projectDir,
					startedAt: Date.now() - 2000,
					status: 'running',
				});
				await writeCliActiveRunRecord(makeCliActiveRun(projectDir, 'cli_active_1'));

				const queryPath =
					process.platform === 'win32' ? projectDir.toUpperCase() : projectDir;
				const rows = await service.listRunsForProject(queryPath);

				expect(rows.map((row) => row.id).sort()).toEqual(['cli_active_1', 'run_ui_1']);
				const cliRow = rows.find((row) => row.id === 'cli_active_1');
				const uiRow = rows.find((row) => row.id === 'run_ui_1');
				expect(cliRow?.source).toBe('cli');
				expect(cliRow?.canStop).toBe(true);
				// A non-terminal CLI run is killable: Kill force-drives a stranded row terminal
				// even though live output stays unavailable.
				expect(cliRow?.canKill).toBe(true);
				expect(cliRow?.canReadOutput).toBe(false);
				expect(uiRow?.source).toBe('web');
				expect(uiRow?.canStop).toBe(true);
				expect(uiRow?.canKill).toBe(true);
				expect(uiRow?.canReadOutput).toBe(true);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('does not treat recent terminal project runs as active', async () => {
		const workspace = await testTempDir('aidd-web-terminal-active-runs-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const serviceInternals = service as unknown as { db: WebDatabase };
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					completedAt: Date.now(),
					exitCode: 1,
					id: 'run_failed_recent',
					mode: 'directive',
					projectName: 'sample-project',
					projectPath: projectDir,
					startedAt: Date.now() - 5000,
					status: 'failed',
					stopReason: 'process_exit',
				});

				expect((await service.listRunsForProject(projectDir)).map((row) => row.id)).toEqual(
					['run_failed_recent']
				);
				expect(await service.hasActiveRunForProject(projectDir)).toBe(false);

				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: 'run_running',
					mode: 'coding',
					projectName: 'sample-project',
					projectPath: projectDir,
					startedAt: Date.now(),
					status: 'running',
				});

				expect(await service.hasActiveRunForProject(projectDir)).toBe(true);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('deduplicates a web run that also has a CLI heartbeat file', async () => {
		const workspace = await testTempDir('aidd-web-dedup-runs-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const logPath = join(workspace, 'data', 'run-logs', 'run_ui_1.log');
				const serviceInternals = service as unknown as { db: WebDatabase };
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: 'run_ui_1',
					logPath,
					mode: 'coding',
					projectName: 'sample-project',
					projectPath: projectDir,
					startedAt: Date.now() - 2000,
					status: 'running',
				});
				await writeCliActiveRunRecord({
					...makeCliActiveRun(projectDir, 'run_ui_1'),
					logPath,
					source: 'web',
				});

				const globalPage = await service.listRunsPage();
				const projectPage = await service.listRunsForProjectPage(projectDir);
				const projectRows = await service.listRunsForProject(projectDir);

				for (const rows of [globalPage.items, projectPage.items, projectRows]) {
					expect(rows.map((row) => row.id)).toEqual(['run_ui_1']);
					expect(rows[0]).toMatchObject({
						canKill: true,
						canReadOutput: true,
						source: 'web',
					});
				}
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('surfaces stale CLI active-run files as failed and ignores malformed files', async () => {
		const workspace = await testTempDir('aidd-web-stale-cli-runs-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			await mkdir(activeRunsDir(projectDir), { recursive: true });
			await Bun.write(join(activeRunsDir(projectDir), 'malformed.json'), '{nope');
			await writeCliActiveRunRecord({
				...makeCliActiveRun(projectDir, 'cli_stale_1'),
				heartbeatAt: Date.now() - 10_000_000,
			});
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const rows = await service.listRunsForProject(projectDir);
				expect(rows).toHaveLength(1);
				expect(rows[0]).toMatchObject({
					id: 'cli_stale_1',
					status: 'failed',
					canStop: false,
					canKill: false,
				});
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('stopRun requests a graceful stop for a CLI heartbeat run whose process is alive', async () => {
		const workspace = await testTempDir('aidd-web-cli-stop-live-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			// A live pid (this test process) keeps the run eligible for a graceful stop request.
			await writeCliActiveRunRecord({
				...makeCliActiveRun(projectDir, 'cli_stop_live'),
				pid: process.pid,
			});
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				// Before the stop request, the running row carries no pending-stop marker.
				const [before] = await service.listRunsForProject(projectDir);
				expect(before?.id).toBe('cli_stop_live');
				expect(before?.status).toBe('running');
				expect(before?.stopRequested).toBe(false);
				await service.stopRun('cli_stop_live');
				expect(await service.readOutput('cli_stop_live')).toMatchObject({
					output: '',
					state: 'cli-only',
				});
				expect(await readFile(join(projectDir, '.aidd', '.stop'), 'utf8')).toContain('T');
				const [activeRun] = await readCliActiveRunRecords(projectDir);
				expect(activeRun?.state).toBe('stop_requested');
				// The stop file marks the run's graceful wind-down: the row stays running but now
				// reports stopRequested so the UI can show "Stopping…" instead of a plain Running.
				const [after] = await service.listRunsForProject(projectDir);
				expect(after?.status).toBe('running');
				expect(after?.stopRequested).toBe(true);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('stopRun on a live web-supervised run surfaces stopRequested on run listings', async () => {
		const workspace = await testTempDir('aidd-web-stop-requested-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			const webSocketMessages: string[] = [];
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
				webSocketMessages,
			});
			try {
				const serviceInternals = service as unknown as { db: WebDatabase };
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: 'run_stop_requested',
					logPath: null,
					mode: 'coding',
					pid: process.pid,
					projectName: 'sample-project',
					projectPath: projectDir,
					startedAt: Date.now() - 2000,
					status: 'running',
				});
				// A fresh heartbeat with a live pid (this test process) keeps the run on the
				// graceful-stop path: stopRun writes the stop file and leaves the row running.
				await writeCliActiveRunRecord({
					...makeCliActiveRun(projectDir, 'run_stop_requested'),
					pid: process.pid,
					source: 'web',
				});
				const [before] = await service.listRunsForProject(projectDir);
				expect(before?.status).toBe('running');
				expect(before?.stopRequested).toBe(false);

				await service.stopRun('run_stop_requested');

				// The row is still running (the CLI honors the stop at its next gate), but every
				// read surface now reports the pending stop so the UI can render "Stopping…".
				const [projectRow] = await service.listRunsForProject(projectDir);
				expect(projectRow?.status).toBe('running');
				expect(projectRow?.stopRequested).toBe(true);
				const page = await service.listRunsPage();
				const pageRow = page.items.find((item) => item.id === 'run_stop_requested');
				expect(pageRow?.stopRequested).toBe(true);
				const single = await service.getRunRecord('run_stop_requested');
				expect(single?.status).toBe('running');
				expect(single?.stopRequested).toBe(true);
				// The immediate broadcast carries the same signal for connected clients.
				expect(
					webSocketMessages.some((message) => {
						const parsed = JSON.parse(message) as {
							payload?: { stopRequested?: boolean };
							runId?: string;
							type?: string;
						};
						return (
							parsed.type === 'run_status' &&
							parsed.runId === 'run_stop_requested' &&
							parsed.payload?.stopRequested === true
						);
					})
				).toBe(true);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('launchRun clears a stale stop file so a fresh run never reads as stopping', async () => {
		const workspace = await testTempDir('aidd-web-stale-stop-clear-');
		// The fake CLI idles long enough that the launched run is still running when asserted.
		const rootDir = await makeLauncherRoot('await Bun.sleep(5000);\n');
		try {
			const projectDir = await makeProject(workspace);
			// Simulate the leftover of a previously stopped run: the CLI only clears this at its
			// own boot, which races the runs listing right after a relaunch.
			await Bun.write(join(projectDir, '.aidd', '.stop'), `${new Date().toISOString()}\n`);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const run = await service.launchRun({ projectDir });
				expect(await Bun.file(join(projectDir, '.aidd', '.stop')).exists()).toBe(false);
				const [row] = await service.listRunsForProject(projectDir);
				expect(row?.id).toBe(run.id);
				expect(row?.aiddVersion).toBe('test-version');
				expect(row?.aiddRevision).toBeNull();
				expect(row?.aiddDirty).toBeNull();
				expect(row?.status).toBe('running');
				expect(row?.stopRequested).toBe(false);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('launchRun refuses to revoke a pending stop for a live sibling run', async () => {
		const workspace = await testTempDir('aidd-web-pending-stop-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				// A live web-supervised run (fresh heartbeat, live pid) with a graceful stop
				// pending: stopRun writes the project-wide stop file and leaves the row running.
				const serviceInternals = service as unknown as { db: WebDatabase };
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: 'run_pending_stop',
					logPath: null,
					mode: 'coding',
					pid: process.pid,
					projectName: 'sample-project',
					projectPath: projectDir,
					startedAt: Date.now() - 2000,
					status: 'running',
				});
				await writeCliActiveRunRecord({
					...makeCliActiveRun(projectDir, 'run_pending_stop'),
					pid: process.pid,
					source: 'web',
				});
				await service.stopRun('run_pending_stop');

				// The stop file is project-wide; until the live run consumes it, launching a
				// sibling must not clear it (the old behavior silently revoked the stop).
				await expect(service.launchRun({ projectDir })).rejects.toThrow(/stop is pending/);
				expect(await Bun.file(join(projectDir, '.aidd', '.stop')).exists()).toBe(true);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('readOutput returns the CLI active run transcript when the record has a logPath', async () => {
		const workspace = await testTempDir('aidd-web-cli-output-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			const logDir = join(workspace, 'data', 'run-logs');
			await mkdir(logDir, { recursive: true });
			const logPath = join(logDir, 'cli_with_log.log');
			await Bun.write(logPath, '[aidd] codex run started\ncodex transcript line\n');
			// A CLI run has no DB row; its active-run record carries the logPath the heartbeat
			// streamed the transcript into. readOutput must read that file instead of returning the
			// empty cli-only state (which is reserved for records with logPath === null).
			await writeCliActiveRunRecord({
				...makeCliActiveRun(projectDir, 'cli_with_log'),
				logPath,
			});
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const result = await service.readOutput('cli_with_log');
				expect(result.state).toBe('ok');
				expect(result.output).toContain('codex transcript line');
				expect(result.truncated).toBe(false);
				expect(result.totalBytes).toBeGreaterThan(0);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('readOutput caps a transcript larger than the limit to its trailing window', async () => {
		const workspace = await testTempDir('aidd-web-cli-output-cap-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			const logDir = join(workspace, 'data', 'run-logs');
			await mkdir(logDir, { recursive: true });
			const logPath = join(logDir, 'cli_big_log.log');
			// Build a transcript well over the 2 MiB server cap: a unique head line that must be
			// trimmed away and a unique tail line that must survive, padded with bulk in between.
			const bulkLine = `${'x'.repeat(127)}\n`;
			const bulk = bulkLine.repeat(Math.ceil((3 * 1024 * 1024) / bulkLine.length));
			await Bun.write(logPath, `HEAD_MARKER_FIRST_LINE\n${bulk}TAIL_MARKER_LAST_LINE\n`);
			await writeCliActiveRunRecord({
				...makeCliActiveRun(projectDir, 'cli_big_log'),
				logPath,
			});
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const result = await service.readOutput('cli_big_log');
				expect(result.state).toBe('ok');
				expect(result.truncated).toBe(true);
				// The full file size is reported even though only the tail is returned.
				expect(result.totalBytes).toBeGreaterThan(3 * 1024 * 1024);
				expect(result.output.length).toBeLessThanOrEqual(2 * 1024 * 1024);
				// Head trimmed, tail preserved, and the window starts on a clean line boundary.
				expect(result.output).not.toContain('HEAD_MARKER_FIRST_LINE');
				expect(result.output).toContain('TAIL_MARKER_LAST_LINE');
				expect(result.output.startsWith('x')).toBe(true);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('stopRun force-terminalizes a CLI heartbeat run whose process already exited', async () => {
		const workspace = await testTempDir('aidd-web-cli-stop-dead-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			// pid null means there is no live process, so a stop file would never be consumed —
			// the row must be driven terminal immediately instead of waiting on a heartbeat.
			await writeCliActiveRunRecord({
				...makeCliActiveRun(projectDir, 'cli_stop_dead'),
				pid: null,
			});
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				await service.stopRun('cli_stop_dead');
				const [activeRun] = await readCliActiveRunRecords(projectDir, {
					includeCompleted: true,
				});
				expect(activeRun?.state).toBe('stopped');
				expect(activeRun?.completedAt).not.toBeNull();
				// No graceful stop file is written when the process is already gone.
				const stopFileExists = await Bun.file(join(projectDir, '.aidd', '.stop')).exists();
				expect(stopFileExists).toBe(false);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('killRun force-terminalizes a CLI heartbeat run that has no DB row', async () => {
		const workspace = await testTempDir('aidd-web-cli-kill-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			// pid null guarantees no live process is signalled; the stranded row must still clear.
			await writeCliActiveRunRecord({
				...makeCliActiveRun(projectDir, 'cli_kill_dead'),
				pid: null,
			});
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				await service.killRun('cli_kill_dead');
				const [activeRun] = await readCliActiveRunRecords(projectDir, {
					includeCompleted: true,
				});
				expect(activeRun?.state).toBe('stopped');
				expect(activeRun?.completedAt).not.toBeNull();
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('builds commands against the root-local aidd entrypoint', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			const command = await buildLaunchCommand(
				rootDir,
				{
					backend: 'codex',
					feature: 'feature-one',
					maxIterations: 1,
					initGitAfterScaffold: true,
					mode: 'audit',
					projectDir,
					prompt: 'check it',
					simulation: true,
					stopBeforeImplementation: true,
				},
				'native'
			);

			expect(command.entrypoint).toBe(join(rootDir, 'cli', 'src', 'index.ts'));
			expect(command.args).toEqual([
				'bun',
				command.entrypoint,
				'--project-dir',
				projectDir,
				'--audit',
				'CODE_QUALITY',
				'--cli',
				'codex',
				'--max-iterations',
				'1',
				'--feature',
				'feature-one',
				'--prompt',
				'check it',
				'--init-git-after-scaffold',
				'--stop-before-implementation',
				'--simulation',
			]);
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('emits --worktree only when worktree isolation is requested', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			const withWt = await buildLaunchCommand(
				rootDir,
				{ mode: 'coding', projectDir, worktree: true },
				'native'
			);
			expect(withWt.args).toContain('--worktree');
			const withoutWt = await buildLaunchCommand(
				rootDir,
				{ mode: 'coding', projectDir },
				'native'
			);
			expect(withoutWt.args).not.toContain('--worktree');
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('emits --audit-findings (with optional source) for the coding sweep', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			const sweepAll = await buildLaunchCommand(
				rootDir,
				{ auditFindings: true, mode: 'coding', projectDir },
				'native'
			);
			expect(sweepAll.args).toContain('--audit-findings');
			// No source → the flag stands alone (no stray positional after it).
			const idx = sweepAll.args.indexOf('--audit-findings');
			expect(sweepAll.args[idx + 1]).toBeUndefined();

			const sweepSource = await buildLaunchCommand(
				rootDir,
				{
					auditFindings: true,
					auditFindingsSource: 'SECURITY',
					mode: 'coding',
					projectDir,
				},
				'native'
			);
			const sourceIdx = sweepSource.args.indexOf('--audit-findings');
			expect(sweepSource.args[sourceIdx + 1]).toBe('SECURITY');

			const noSweep = await buildLaunchCommand(
				rootDir,
				{ mode: 'coding', projectDir },
				'native'
			);
			expect(noSweep.args).not.toContain('--audit-findings');
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('appends tokenized extraArgs (quote-aware) after the default flags', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			const command = await buildLaunchCommand(
				rootDir,
				{
					backend: 'codex',
					mode: 'coding',
					projectDir,
					extraArgs: '--filter-by id --filter audit-* --prompt "do the thing"',
				},
				'native'
			);

			expect(command.args).toEqual([
				'bun',
				command.entrypoint,
				'--project-dir',
				projectDir,
				'--cli',
				'codex',
				'--filter-by',
				'id',
				'--filter',
				'audit-*',
				'--prompt',
				'do the thing',
			]);
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('rejects extraArgs with an unterminated quote as a 400', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			const error = await buildLaunchCommand(
				rootDir,
				{ backend: 'codex', mode: 'coding', projectDir, extraArgs: '--prompt "oops' },
				'native'
			).catch((caught: unknown) => caught);
			expect(error).toBeInstanceOf(HttpError);
			expect((error as HttpError).status).toBe(400);
			expect((error as HttpError).message).toContain('unterminated quote');
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('rejects extraArgs that target protected scope/mode flags as a 400', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			for (const extraArgs of [
				'--project-dir d:/applications/other',
				'--project-dir=d:/applications/other',
				'--directive',
				'--director',
				'--spec ../../secret.md',
			]) {
				const error = await buildLaunchCommand(
					rootDir,
					{ backend: 'codex', mode: 'coding', projectDir, extraArgs },
					'native'
				).catch((caught: unknown) => caught);
				expect(error).toBeInstanceOf(HttpError);
				expect((error as HttpError).status).toBe(400);
			}
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('builds triumvirate commands with role flags', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			const command = await buildLaunchCommand(
				rootDir,
				{
					backend: 'codex',
					execBackend: 'native',
					execModel: 'exec-model',
					mode: 'triumvirate',
					model: 'primary-model',
					overseerBackend: 'opencode',
					overseerModel: 'overseer-model',
					projectDir,
					secondaryBackend: 'claude-code',
					secondaryModel: 'secondary-model',
				},
				'native'
			);

			expect(command.args).toEqual([
				'bun',
				command.entrypoint,
				'--project-dir',
				projectDir,
				'--triumvirate',
				'--cli',
				'codex',
				'--model',
				'primary-model',
				'--secondary-cli',
				'claude-code',
				'--secondary-model',
				'secondary-model',
				'--overseer-cli',
				'opencode',
				'--overseer-model',
				'overseer-model',
				'--exec-cli',
				'native',
				'--exec-model',
				'exec-model',
			]);
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('rejects internal launch backend name', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			await expect(
				buildLaunchCommand(
					rootDir,
					{
						backend: 'internal',
						mode: 'triumvirate',
						overseerBackend: 'claude-code',
						projectDir,
						secondaryBackend: 'codex',
					} as unknown as RunLaunchRequest,
					'native'
				)
			).rejects.toThrow("Unknown backend 'internal'");
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('omits triumvirate execution flags when execution backend is not selected', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			const command = await buildLaunchCommand(
				rootDir,
				{
					backend: 'codex',
					mode: 'triumvirate',
					overseerBackend: 'opencode',
					overseerModel: 'overseer-model',
					projectDir,
					secondaryBackend: 'claude-code',
				},
				'native'
			);

			expect(command.args).toEqual([
				'bun',
				command.entrypoint,
				'--project-dir',
				projectDir,
				'--triumvirate',
				'--cli',
				'codex',
				'--secondary-cli',
				'claude-code',
				'--overseer-cli',
				'opencode',
				'--overseer-model',
				'overseer-model',
			]);
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('omits triumvirate role flags on non-triumvirate launches even when settings define them', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			const command = await buildLaunchCommand(
				rootDir,
				{ backend: 'native', mode: 'coding', model: 'glm-5.1', projectDir },
				{
					backend: 'native',
					model: 'glm-5.1',
					triumvirate: {
						execCli: 'native',
						execModel: 'glm-5.1',
						overseerCli: 'claude-code',
						overseerModel: 'claude-opus-4-8',
						secondaryCli: 'codex',
						secondaryModel: 'gpt-5.6',
					},
				}
			);

			expect(command.args).toEqual([
				'bun',
				command.entrypoint,
				'--project-dir',
				projectDir,
				'--cli',
				'native',
				'--model',
				'glm-5.1',
			]);
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('fills triumvirate role flags from settings defaults on triumvirate launches', async () => {
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = resolve('demo-project');
			const command = await buildLaunchCommand(
				rootDir,
				{ backend: 'native', mode: 'triumvirate', projectDir },
				{
					backend: 'native',
					triumvirate: {
						overseerCli: 'claude-code',
						overseerModel: 'claude-opus-4-8',
						secondaryCli: 'codex',
						secondaryModel: 'gpt-5.6',
					},
				}
			);

			expect(command.args).toEqual([
				'bun',
				command.entrypoint,
				'--project-dir',
				projectDir,
				'--triumvirate',
				'--cli',
				'native',
				'--secondary-cli',
				'codex',
				'--secondary-model',
				'gpt-5.6',
				'--overseer-cli',
				'claude-code',
				'--overseer-model',
				'claude-opus-4-8',
			]);
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('runs route accepts triumvirate launch bodies and rejects invalid role backends', async () => {
		const runRecord = {
			backend: 'codex',
			completedAt: null,
			durationMs: null,
			errorMessage: null,
			exitCode: null,
			id: 'run_1',
			logPath: null,
			mode: 'triumvirate',
			model: 'primary-model',
			pid: null,
			pipelineSessionId: null,
			projectName: 'demo',
			projectPath: 'd:/applications/demo',
			startedAt: Date.now(),
			status: 'running',
		};
		const app = createRunsRoutes({
			runService: {
				launchRun: async () => runRecord,
			},
			telemetryService: {
				recordStart: async () => 'inv_mock',
				reconcileInvocationFromRun: async () => {},
			} as unknown as TelemetryService,
		} as unknown as WebContext);
		const valid = await app.handle(
			new Request('http://localhost/api/v1/runs', {
				body: JSON.stringify({
					backend: 'native',
					execBackend: 'native',
					mode: 'triumvirate',
					overseerBackend: 'opencode',
					projectDir: 'd:/applications/demo',
					secondaryBackend: 'claude-code',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		const invalid = await app.handle(
			new Request('http://localhost/api/v1/runs', {
				body: JSON.stringify({
					execBackend: 'native',
					mode: 'triumvirate',
					overseerBackend: 'opencode',
					projectDir: 'd:/applications/demo',
					secondaryBackend: 'not-real',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		const internalAlias = await app.handle(
			new Request('http://localhost/api/v1/runs', {
				body: JSON.stringify({
					backend: 'internal',
					mode: 'triumvirate',
					overseerBackend: 'opencode',
					projectDir: 'd:/applications/demo',
					secondaryBackend: 'claude-code',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);

		expect(valid.status).toBe(200);
		expect(invalid.status).toBe(422);
		expect(internalAlias.status).toBe(422);
	});

	test('runs route rejects model with shell metacharacters (command injection)', async () => {
		const app = createRunsRoutes({
			runService: { launchRun: async () => ({ id: 'x' }) },
		} as unknown as WebContext);

		const res = await app.handle(
			new Request('http://localhost/api/v1/runs', {
				body: JSON.stringify({
					model: 'foo & calc.exe',
					projectDir: 'd:/applications/demo',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(res.status).toBe(422);
	});

	test('runs route rejects secondaryModel with shell metacharacters', async () => {
		const app = createRunsRoutes({
			runService: { launchRun: async () => ({ id: 'x' }) },
		} as unknown as WebContext);

		const res = await app.handle(
			new Request('http://localhost/api/v1/runs', {
				body: JSON.stringify({
					projectDir: 'd:/applications/demo',
					secondaryModel: 'foo & calc.exe',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(res.status).toBe(422);
	});

	test('runs route rejects reasoningEffort with shell metacharacters', async () => {
		const app = createRunsRoutes({
			runService: { launchRun: async () => ({ id: 'x' }) },
		} as unknown as WebContext);

		const res = await app.handle(
			new Request('http://localhost/api/v1/runs', {
				body: JSON.stringify({
					projectDir: 'd:/applications/demo',
					reasoningEffort: 'low; rm -rf /',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(res.status).toBe(422);
	});

	test('runs route accepts safe model identifiers', async () => {
		const app = createRunsRoutes({
			runService: { launchRun: async () => ({ id: 'x' }) },
			telemetryService: {
				recordStart: async () => 'inv_mock',
				reconcileInvocationFromRun: async () => {},
			} as unknown as TelemetryService,
		} as unknown as WebContext);

		for (const model of [
			'claude-3.5-sonnet',
			'gpt-4o',
			'openai/gpt-4',
			'anthropic/claude-3:latest',
		]) {
			const res = await app.handle(
				new Request('http://localhost/api/v1/runs', {
					body: JSON.stringify({ model, projectDir: 'd:/applications/demo' }),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				})
			);
			expect(res.status).toBe(200);
		}
	});

	test('persists completed runs, logs output, and broadcasts run events', async () => {
		const workspace = await testTempDir('aidd-web-run-');
		const rootDir = await makeLauncherRoot(
			`${logWriter('launcher output\n')}${heartbeatTerminator()}`
		);
		const dataDir = join(workspace, 'data');
		const messages: string[] = [];
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir,
				rootDir,
				webSocketMessages: messages,
			});
			try {
				const run = await service.launchRun({
					mode: 'coding',
					projectDir,
					simulation: true,
				});

				const completed = await waitFor(
					() => service.getRun(run.id),
					(value) => value.status === 'completed'
				);
				const output = await service.readOutput(run.id);

				expect(completed.exitCode).toBe(0);
				expect(completed.logPath).toBe(join(dataDir, 'run-logs', `${run.id}.log`));
				const expectedCommandArgs = [
					'bun',
					join(rootDir, 'cli', 'src', 'index.ts'),
					'--project-dir',
					projectDir,
					'--cli',
					'native',
					...(completed.model ? ['--model', completed.model] : []),
					'--reasoning-effort',
					completed.reasoningEffort ?? 'low',
					'--simulation',
				];
				expect(JSON.parse(completed.commandArgsJson ?? '[]')).toEqual(expectedCommandArgs);
				expect(output.state).toBe('ok');
				expect(output.output).toContain('launcher output');
				expect(await stat(completed.logPath!)).toBeTruthy();
				await rm(completed.logPath!, { force: true });
				expect(await service.readOutput(run.id)).toMatchObject({
					output: '',
					state: 'unavailable',
				});
				const listedAfterDelete = await service.listRuns();
				expect(listedAfterDelete).toHaveLength(1);
				expect(listedAfterDelete[0]!.status).toBe('completed');
				expect(listedAfterDelete[0]!.launchCommand).toEqual({
					args: expectedCommandArgs,
					display: expectedCommandArgs.join(' '),
					source: 'exact',
				});
				expect(messages.some((message) => message.includes('"type":"run_output"'))).toBe(
					true
				);
				expect(messages.some((message) => message.includes('"status":"completed"'))).toBe(
					true
				);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('persists the run summary from the heartbeat record and surfaces it via the DTO', async () => {
		const workspace = await testTempDir('aidd-web-run-');
		const rootDir = await makeLauncherRoot(
			heartbeatTerminator({
				summary: 'audit batch finished 32/32 audit(s) with 0 finding(s)',
			})
		);
		const dataDir = join(workspace, 'data');
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({ allowedRoot: workspace, dataDir, rootDir });
			try {
				const run = await service.launchRun({
					mode: 'audit',
					projectDir,
					simulation: true,
				});
				const completed = await waitFor(
					() => service.getRun(run.id),
					(value) => value.status === 'completed'
				);
				expect(completed.summary).toBe(
					'audit batch finished 32/32 audit(s) with 0 finding(s)'
				);
				const listed = await service.listRuns();
				expect(listed[0]!.summary).toBe(
					'audit batch finished 32/32 audit(s) with 0 finding(s)'
				);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('launching a run for a non-existent in-root project returns 404 and spawns nothing', async () => {
		const workspace = await testTempDir('aidd-web-run-missing-');
		const rootDir = await makeLauncherRoot('console.log("should not run");\n');
		try {
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const app = new Elysia()
					.use(errorHandlerPlugin)
					.use(createRunsRoutes({ runService: service } as unknown as WebContext));
				const ghostProject = join(workspace, 'does-not-exist');

				const res = await app.handle(
					new Request('http://localhost/api/v1/runs', {
						body: JSON.stringify({ projectDir: ghostProject, simulation: true }),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					})
				);

				expect(res.status).toBe(404);
				expect(await service.listRuns()).toHaveLength(0);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('uses current settings defaults for omitted launch backend and model', async () => {
		const workspace = await testTempDir('aidd-web-run-defaults-');
		const rootDir = await makeLauncherRoot(
			`
{
	const { writeFile } = await import('node:fs/promises');
	const __logPath = process.env.AIDD_EXT_LOG_PATH;
	if (__logPath) await writeFile(__logPath, JSON.stringify(Bun.argv));
}
${heartbeatTerminator()}`
		);
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite, web } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				service.updateConfig({
					...makeConfig(web),
					backends: { codex: { model: 'codex-default' } },
					cli: 'codex',
					sharedModel: 'shared-default',
				});
				const run = await service.launchRun({ projectDir });
				const completed = await waitFor(
					() => service.getRun(run.id),
					(value) => value.status === 'completed'
				);
				const output = await service.readOutput(run.id);

				expect(completed.backend).toBe('codex');
				expect(completed.model).toBe('codex-default');
				expect(output.state).toBe('ok');
				expect(output.output).toContain('--cli');
				expect(output.output).toContain('codex');
				expect(output.output).toContain('--model');
				expect(output.output).toContain('codex-default');
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('persists provider-scoped reasoning for omitted web launch reasoning', async () => {
		const workspace = await testTempDir('aidd-web-run-provider-reasoning-');
		const rootDir = await makeLauncherRoot(heartbeatTerminator());
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				config: {
					providers: {
						zhipu: {
							model: 'provider-default-model',
							reasoningEffort: 'high',
						},
					},
				},
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const run = await service.launchRun({ projectDir });
				const completed = await waitFor(
					() => service.getRun(run.id),
					(value) => value.status === 'completed'
				);

				expect(completed.backend).toBe('native');
				expect(completed.model).toBe('provider-default-model');
				expect(completed.provider).toBe('zhipu');
				expect(completed.reasoningEffort).toBe('high');
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('project .aidd/aidd.config.json backend/model win over server defaults', async () => {
		const workspace = await testTempDir('aidd-web-run-project-config-');
		const rootDir = await makeLauncherRoot(heartbeatTerminator());
		try {
			const projectDir = await makeProject(workspace);
			await Bun.write(
				join(projectDir, '.aidd', 'aidd.config.json'),
				JSON.stringify({
					cli: 'claude-code',
					model: 'project-model',
					reasoningEffort: 'high',
				})
			);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const run = await service.launchRun({ projectDir });
				const completed = await waitFor(
					() => service.getRun(run.id),
					(value) => value.status === 'completed'
				);

				expect(completed.backend).toBe('claude-code');
				expect(completed.model).toBe('project-model');
				expect(completed.reasoningEffort).toBe('high');
				const argv = JSON.parse(completed.commandArgsJson ?? '[]') as string[];
				expect(argv).toContain('--cli');
				expect(argv[argv.indexOf('--cli') + 1]).toBe('claude-code');
				expect(argv[argv.indexOf('--model') + 1]).toBe('project-model');
				expect(argv[argv.indexOf('--reasoning-effort') + 1]).toBe('high');
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('web audit launches resolve the mode-scoped auditModel like the CLI', async () => {
		const workspace = await testTempDir('aidd-web-run-audit-model-');
		const rootDir = await makeLauncherRoot(heartbeatTerminator());
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				config: { auditModel: 'audit-model', codeModel: 'code-model' },
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const auditRun = await service.launchRun({ mode: 'audit', projectDir });
				const audited = await waitFor(
					() => service.getRun(auditRun.id),
					(value) => value.status === 'completed'
				);
				expect(audited.model).toBe('audit-model');

				const codingRun = await service.launchRun({ projectDir });
				const coded = await waitFor(
					() => service.getRun(codingRun.id),
					(value) => value.status === 'completed'
				);
				expect(coded.model).toBe('code-model');
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('stop writes the project stop file and preserves stopped status after exit', async () => {
		const workspace = await testTempDir('aidd-web-stop-');
		const rootDir = await makeLauncherRoot(
			`
{
	const { access } = await import('node:fs/promises');
	const { join } = await import('node:path');
	const __projectDir = process.argv[process.argv.indexOf('--project-dir') + 1];
	const __deadline = Date.now() + 4000;
	while (Date.now() < __deadline) {
		try {
			await access(join(__projectDir, '.aidd', '.stop'));
			break;
		} catch {
			await Bun.sleep(25);
		}
	}
}
${heartbeatTerminator({ state: 'stopped', exitCode: 130 })}`
		);
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const run = await service.launchRun({ projectDir });
				expect((await service.listRunsForProject(projectDir)).map((row) => row.id)).toEqual(
					[run.id]
				);
				await service.stopRun(run.id);
				const stopped = await waitFor(
					() => service.getRun(run.id),
					(value) => value.status === 'stopped' && value.completedAt !== null
				);

				expect(stopped.status).toBe('stopped');
				expect(await readFile(join(projectDir, '.aidd', '.stop'), 'utf8')).toContain('T');
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			// The detached run + its relauncher can hold the stub's index.ts open briefly after
			// exit on Windows; retry the cleanup rather than racing the handle release.
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('kill preserves killed status after subprocess exit', async () => {
		const workspace = await testTempDir('aidd-web-kill-');
		const rootDir = await makeLauncherRoot('await Bun.sleep(5000);\nconsole.log("done");\n');
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const run = await service.launchRun({ projectDir });
				await service.killRun(run.id);
				const killed = await waitFor(
					() => service.getRun(run.id),
					(value) => value.status === 'killed' && value.completedAt !== null
				);

				expect(killed.status).toBe('killed');
				expect(killed.exitCode).not.toBe(0);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('stopRun rejects terminal runs without changing stored status or writing .stop', async () => {
		const workspace = await testTempDir('aidd-web-stop-terminal-');
		const rootDir = await makeLauncherRoot(heartbeatTerminator());
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const run = await service.launchRun({ projectDir, simulation: true });
				const completed = await waitFor(
					() => service.getRun(run.id),
					(value) => value.status === 'completed'
				);

				await expect(service.stopRun(run.id)).rejects.toBeInstanceOf(RunControlError);
				await expect(service.killRun(run.id)).rejects.toBeInstanceOf(RunControlError);

				const after = await service.getRun(run.id);
				expect(after?.status).toBe('completed');
				expect(after?.completedAt).toBe(completed.completedAt);
				const stopFileExists = await Bun.file(join(projectDir, '.aidd', '.stop')).exists();
				expect(stopFileExists).toBe(false);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('killRun terminates the detached process and rejects subsequent control operations', async () => {
		const workspace = await testTempDir('aidd-web-kill-tree-');
		const rootDir = await makeLauncherRoot('await Bun.sleep(5000);\n');
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const run = await service.launchRun({ projectDir });
				await service.killRun(run.id);
				const killed = await waitFor(
					() => service.getRun(run.id),
					(value) => value.status === 'killed' && value.completedAt !== null
				);
				expect(killed.status).toBe('killed');

				await expect(service.killRun(run.id)).rejects.toBeInstanceOf(RunControlError);
				await expect(service.stopRun(run.id)).rejects.toBeInstanceOf(RunControlError);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('launchRun kills the subprocess and broadcasts failure when persistence fails', async () => {
		const workspace = await testTempDir('aidd-web-orphan-');
		const rootDir = await makeLauncherRoot('await Bun.sleep(5000);\n');
		const messages: string[] = [];
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
				webSocketMessages: messages,
			});
			try {
				let capturedPid: number | null | undefined;
				const serviceInternals = service as unknown as {
					commands: {
						insertRunIfUnderCeiling: (args: unknown) => Promise<unknown>;
					};
				};
				const originalInsert = serviceInternals.commands.insertRunIfUnderCeiling;
				serviceInternals.commands.insertRunIfUnderCeiling = async (args: unknown) => {
					const typedArgs = args as { values: { pid?: null | number } };
					capturedPid = typedArgs.values.pid;
					throw new Error('forced insert failure');
				};

				await expect(service.launchRun({ projectDir })).rejects.toThrow(
					'forced insert failure'
				);

				if (process.platform === 'win32') {
					// The run is detached through a hidden PowerShell relauncher, so the row
					// records no pid (the transient bridge pid is intentionally not stored).
					// The persistence-failure
					// cleanup therefore cannot reach the breakaway run — a documented, rare edge —
					// so we assert only the contract that still holds. The orphaned stub exits on
					// its own; removeTempTree tolerates the briefly-busy directory.
					expect(capturedPid).toBeNull();
				} else {
					// POSIX: the row records the directly-spawned child pid, which the cleanup kills.
					expect(capturedPid).toBeDefined();
					await wait(200);
					let alive = true;
					try {
						process.kill(capturedPid!, 0);
					} catch {
						alive = false;
					}
					expect(alive).toBe(false);
				}

				serviceInternals.commands.insertRunIfUnderCeiling = originalInsert;
				const rows = await service.listRuns();
				expect(rows).toHaveLength(0);
				expect(
					messages.some(
						(message) =>
							message.includes('"status":"failed"') &&
							message.includes('forced insert failure')
					)
				).toBe(true);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('recipe service stores pipeline JSON recipes and rejects path-like ids', async () => {
		const workspace = await testTempDir('aidd-web-recipes-');
		try {
			const recipeService = new RecipeService(workspace);
			await recipeService.writeRecipe({
				id: 'quick_check',
				name: 'Quick Check',
				parameters: [],
				steps: [
					{
						configJson: { maxIterations: 1, prompt: 'verify the selected feature' },
						id: 'quick_check_step_1',
						name: 'Verify',
						stepType: 'aidd-cli',
					},
				],
			});

			const recipes = await recipeService.listRecipes();
			const recipe = await recipeService.readRecipe('quick_check');
			await Bun.write(
				join(workspace, 'recipes', 'filename_wins.json'),
				JSON.stringify({
					id: 'embedded_id',
					name: 'Filename Wins',
					steps: [
						{
							configJson: {},
							name: 'Noop',
							stepType: 'shell',
						},
					],
				})
			);
			const filenameWins = await recipeService.readRecipe('filename_wins');
			await Bun.write(
				join(workspace, 'recipes', 'legacy_claude_step.json'),
				JSON.stringify({
					name: 'Legacy Claude Step',
					steps: [
						{
							configJson: { prompt: 'legacy prompt' },
							name: 'Legacy',
							stepType: 'claude-code',
						},
					],
				})
			);

			expect(recipes.map((entry) => entry.id)).toEqual(['quick_check']);
			expect(recipe.steps[0]?.stepType).toBe('aidd-cli');
			expect(filenameWins.id).toBe('filename_wins');
			await expect(recipeService.readRecipe('legacy_claude_step')).rejects.toThrow(
				'Recipe has invalid steps: legacy_claude_step'
			);
			expect(
				recipeService.writeRecipe({
					id: '../escape',
					name: 'Bad',
					parameters: [],
					steps: [
						{
							configJson: {},
							id: 'bad_step',
							name: 'Bad',
							stepType: 'shell',
						},
					],
				})
			).rejects.toThrow('Invalid recipe id');
		} finally {
			await removeTempTree(workspace);
		}
	});

	test('reconcileStaleRuns transitions orphaned running rows to failed and broadcasts', async () => {
		const workspace = await testTempDir('aidd-web-reconcile-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		const messages: string[] = [];
		try {
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
				webSocketMessages: messages,
			});
			try {
				const serviceInternals = service as unknown as { db: WebDatabase };
				const startedAt = Date.now() - 5000;
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: 'run_orphan_1',
					mode: 'coding',
					projectName: 'demo',
					projectPath: join(workspace, 'demo'),
					startedAt,
					status: 'running',
				});
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					completedAt: startedAt + 10,
					id: 'run_done_1',
					mode: 'coding',
					projectName: 'demo',
					projectPath: join(workspace, 'demo'),
					startedAt,
					status: 'completed',
				});
				// A dead run's cross-run feature leases must be reaped alongside the reconcile
				// (the hard-dead process never released them in-process); another run's lease
				// must survive untouched. Lease pids are this live test process, so a successful
				// probe below can only mean the reconcile deleted the file — not a pid-dead steal.
				const demoDir = join(workspace, 'demo');
				await gitInitRepo(demoDir);
				expect(
					await leaseServiceFor(demoDir, 'run_orphan_1').acquire('feat-orphaned')
				).toEqual({ acquired: true });
				expect(
					await leaseServiceFor(demoDir, 'run_live_other').acquire('feat-live')
				).toEqual({ acquired: true });

				await service.reconcileStaleRuns();

				const orphan = await service.getRun('run_orphan_1');
				expect(orphan?.status).toBe('failed');
				expect(orphan?.exitCode).toBe(-1);
				expect(orphan?.completedAt).toBeGreaterThan(0);
				expect(orphan?.durationMs).toBeGreaterThan(0);
				expect(orphan?.errorMessage).toContain('cannot be resumed');

				// A terminal row must be left untouched.
				const done = await service.getRun('run_done_1');
				expect(done?.status).toBe('completed');
				expect(done?.exitCode).toBeNull();

				const reconciledBroadcast = messages.find(
					(message) =>
						message.includes('"type":"run_status"') &&
						message.includes('run_orphan_1') &&
						message.includes('"status":"failed"') &&
						message.includes('"exitCode":-1')
				);
				expect(reconciledBroadcast).toBeDefined();

				// The dead run's lease is gone (a fresh run can claim the feature); the other
				// run's lease was never touched.
				const probe = leaseServiceFor(demoDir, 'run_probe');
				expect(await probe.acquire('feat-orphaned')).toEqual({ acquired: true });
				const stillHeld = await probe.acquire('feat-live');
				expect(stillHeld.acquired).toBe(false);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('sweepOrphanedRuns fast-fails a dead-pid run within grace but spares live-pid and pidless startups', async () => {
		const workspace = await testTempDir('aidd-web-sweep-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		const messages: string[] = [];
		try {
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
				webSocketMessages: messages,
			});
			try {
				const serviceInternals = service as unknown as {
					db: WebDatabase;
					tailWatchers: Map<string, { stop: () => Promise<void> }>;
				};
				// A reliably-dead pid: spawn a process and wait for it to exit.
				const deadProc = Bun.spawn([process.execPath, '-e', ''], { windowsHide: true });
				await deadProc.exited;
				const deadPid = deadProc.pid!;
				const startedAt = Date.now() - 5000;
				// Early crash: 'running', no heartbeat file, a recorded pid that is provably dead
				// -> fast-failed even inside the grace window.
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: 'run_sweep_dead',
					mode: 'coding',
					pid: deadPid,
					projectName: 'demo',
					projectPath: join(workspace, 'demo'),
					source: 'web',
					startedAt,
					status: 'running',
				});
				// Mid-startup: 'running', no heartbeat yet, but its pid is alive -> left running.
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: 'run_sweep_starting',
					mode: 'coding',
					pid: process.pid,
					projectName: 'demo',
					projectPath: join(workspace, 'demo'),
					startedAt,
					status: 'running',
				});
				// Detached startup (e.g. a Windows launch): 'running', no heartbeat yet, and a null
				// pid (the real CLI pid arrives only with the first heartbeat) -> must be spared, not
				// mistaken for a dead run.
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: 'run_sweep_pidless',
					mode: 'coding',
					pid: null,
					projectName: 'demo',
					projectPath: join(workspace, 'demo'),
					startedAt,
					status: 'running',
				});
				// A launch-time invocation-telemetry row keyed by the dead run's id; the sweep must
				// close it so it does not linger 'running' until the next startup reconciliation.
				await serviceInternals.db.insert(schema.invocationEvents).values({
					id: 'inv_sweep_dead',
					projectName: 'demo',
					projectPath: join(workspace, 'demo'),
					resourceId: 'demo-skill',
					resourceName: 'demo-skill',
					resourceType: 'skill',
					runId: 'run_sweep_dead',
					source: 'web',
					startedAt,
					status: 'running',
				});
				// The launch-time tail watcher fs.watch handle the sweep must stop.
				let tailStopped = false;
				serviceInternals.tailWatchers.set('run_sweep_dead', {
					stop: async () => {
						tailStopped = true;
					},
				});
				// The dead run's cross-run feature lease must be reaped with it; the spared
				// startup run's lease must survive. Lease pids are this live test process, so a
				// successful probe below can only mean the sweep deleted the file.
				const demoDir = join(workspace, 'demo');
				await gitInitRepo(demoDir);
				expect(
					await leaseServiceFor(demoDir, 'run_sweep_dead').acquire('feat-swept')
				).toEqual({ acquired: true });
				expect(
					await leaseServiceFor(demoDir, 'run_sweep_starting').acquire('feat-starting')
				).toEqual({ acquired: true });

				const swept = await service.sweepOrphanedRuns();
				expect(swept).toBe(1);

				const dead = await service.getRun('run_sweep_dead');
				expect(dead?.status).toBe('failed');
				expect(dead?.exitCode).toBe(-1);
				expect(dead?.completedAt).toBeGreaterThan(0);
				expect(dead?.errorMessage).toContain('before writing a heartbeat');

				// A run still in startup (live pid) must survive the sweep.
				const starting = await service.getRun('run_sweep_starting');
				expect(starting?.status).toBe('running');

				// The dead run's lease is free again; the live startup run's lease is untouched.
				const leaseProbe = leaseServiceFor(demoDir, 'run_sweep_probe');
				expect(await leaseProbe.acquire('feat-swept')).toEqual({ acquired: true });
				const stillLeased = await leaseProbe.acquire('feat-starting');
				expect(stillLeased.acquired).toBe(false);

				// A detached pidless startup (real pid not yet recorded) must also survive.
				const pidless = await service.getRun('run_sweep_pidless');
				expect(pidless?.status).toBe('running');

				// The tail watcher must be stopped and removed (no leaked fs.watch handle).
				expect(tailStopped).toBe(true);
				expect(serviceInternals.tailWatchers.has('run_sweep_dead')).toBe(false);

				// The invocation-telemetry row must be closed to failed.
				const invocation = (
					await serviceInternals.db
						.select()
						.from(schema.invocationEvents)
						.where(eq(schema.invocationEvents.id, 'inv_sweep_dead'))
				)[0];
				expect(invocation?.status).toBe('failed');
				expect(invocation?.completedAt).toBeGreaterThan(0);

				const sweptBroadcast = messages.find(
					(message) =>
						message.includes('"type":"run_status"') &&
						message.includes('run_sweep_dead') &&
						message.includes('"status":"failed"')
				);
				expect(sweptBroadcast).toBeDefined();
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('sweepOrphanedRuns fails a heartbeat-less run with a reused live pid past the grace window', async () => {
		const workspace = await testTempDir('aidd-web-sweep-reuse-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const serviceInternals = service as unknown as { db: WebDatabase };
				// 'running', no heartbeat file, and a *live* pid (this test process) — but the row is
				// far older than the startup grace window, so the pid must be treated as reused and
				// the row swept to failed rather than spared as a mid-startup run.
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: 'run_sweep_reused_pid',
					mode: 'coding',
					pid: process.pid,
					projectName: 'demo',
					projectPath: join(workspace, 'demo'),
					source: 'web',
					startedAt: Date.now() - 200_000,
					status: 'running',
				});

				const swept = await service.sweepOrphanedRuns();
				expect(swept).toBe(1);

				const reused = await service.getRun('run_sweep_reused_pid');
				expect(reused?.status).toBe('failed');
				expect(reused?.exitCode).toBe(-1);
				expect(reused?.errorMessage).toContain('before writing a heartbeat');
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('ingestCompletedCliRuns terminalizes a stranded running row from a completed heartbeat', async () => {
		const workspace = await testTempDir('aidd-web-ingest-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = join(workspace, 'demo-project');
			const startedAt = Date.now() - 60_000;
			const completedAt = Date.now() - 1000;
			const runId = 'run_ingest_stale';
			// The CLI run finished and wrote a terminal heartbeat record to disk...
			await writeCliActiveRunRecord({
				aiddDirty: true,
				aiddRevision: '0123456789abcdef',
				aiddVersion: '2.125.0',
				aiSummary: null,
				backend: 'native',
				cachedTokens: 2_048,
				commandArgs: [
					'aidd',
					'--project-dir',
					projectDir,
					'--filter-by',
					'id',
					'--filter',
					'remediation-*',
					'--cli',
					'native',
					'--reasoning-effort',
					'high',
				],
				completedAt,
				durationMs: completedAt - startedAt,
				exitCode: 0,
				filesChanged: 3,
				heartbeatAt: completedAt,
				id: runId,
				inputTokens: 50_000,
				linesAdded: 120,
				linesRemoved: 40,
				logPath: null,
				mode: 'coding',
				model: null,
				outputTokens: 8_000,
				pid: 12345,
				projectName: 'demo-project',
				projectPath: projectDir,
				provider: null,
				reasoningEffort: null,
				reasoningTokens: 1_000,
				source: 'web',
				startedAt,
				state: 'completed',
				stopFile: join(projectDir, '.aidd', '.stop'),
				stopReason: null,
				summary: 'done',
			});
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const serviceInternals = service as unknown as { db: WebDatabase };
				// ...but the live runs row is stranded at 'running' (the bug under test).
				await serviceInternals.db.insert(schema.runs).values({
					backend: 'native',
					id: runId,
					mode: 'coding',
					pid: 12345,
					projectName: 'demo-project',
					projectPath: projectDir,
					source: 'web',
					startedAt,
					status: 'running',
				});

				const ingested = await service.ingestCompletedCliRuns();
				expect(ingested).toBe(1);

				// Ingest must drive the existing row to terminal BEFORE removing the heartbeat file.
				const row = await service.getRun(runId);
				expect(row?.status).toBe('completed');
				expect(row?.exitCode).toBe(0);
				expect(row?.completedAt).toBe(completedAt);
				expect(row?.aiddVersion).toBe('2.125.0');
				expect(row?.aiddRevision).toBe('0123456789abcdef');
				expect(row?.aiddDirty).toBe(true);

				// The terminal heartbeat's output metrics must land on the runs row.
				const [metricsRow] = await serviceInternals.db
					.select({
						cachedTokens: schema.runs.cachedTokens,
						filesChanged: schema.runs.filesChanged,
						inputTokens: schema.runs.inputTokens,
						linesAdded: schema.runs.linesAdded,
						linesRemoved: schema.runs.linesRemoved,
						outputTokens: schema.runs.outputTokens,
						reasoningTokens: schema.runs.reasoningTokens,
					})
					.from(schema.runs)
					.where(eq(schema.runs.id, runId));
				expect(metricsRow).toEqual({
					cachedTokens: 2_048,
					filesChanged: 3,
					inputTokens: 50_000,
					linesAdded: 120,
					linesRemoved: 40,
					outputTokens: 8_000,
					reasoningTokens: 1_000,
				});
				expect(JSON.parse(row?.commandArgsJson ?? '[]')).toEqual([
					'aidd',
					'--project-dir',
					projectDir,
					'--filter-by',
					'id',
					'--filter',
					'remediation-*',
					'--cli',
					'native',
					'--reasoning-effort',
					'high',
				]);
				const record = await service.getRunRecord(runId);
				expect(record?.launchCommand).toMatchObject({
					args: [
						'aidd',
						'--project-dir',
						projectDir,
						'--filter-by',
						'id',
						'--filter',
						'remediation-*',
						'--cli',
						'native',
						'--reasoning-effort',
						'high',
					],
					source: 'exact',
				});

				// The terminal heartbeat file is cleaned up after a successful terminalize.
				const remaining = await readCliActiveRunRecords(projectDir, {
					includeCompleted: true,
				});
				expect(remaining.find((record) => record.id === runId)).toBeUndefined();
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('surfaces captured command args for direct CLI active runs', async () => {
		const workspace = await testTempDir('aidd-web-cli-command-');
		const rootDir = await makeLauncherRoot('console.log("ok");\n');
		try {
			const projectDir = await makeProject(workspace);
			const expectedArgs = [
				'aidd',
				'--project-dir',
				projectDir,
				'--filter-by',
				'id',
				'--filter',
				'remediation-*',
				'--cli',
				'codex',
				'--model',
				'gpt-5.6',
				'--reasoning-effort',
				'high',
			];
			await writeCliActiveRunRecord({
				...makeCliActiveRun(projectDir, 'cli_command_args'),
				commandArgs: expectedArgs,
			});
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
			});
			try {
				const rows = await service.listRunsForProject(projectDir);
				const row = rows.find((item) => item.id === 'cli_command_args');
				expect(row?.launchCommand).toEqual({
					args: expectedArgs,
					display: [
						'aidd',
						'--project-dir',
						projectDir,
						'--filter-by id',
						"--filter 'remediation-*'",
						'--cli codex',
						'--model gpt-5.6',
						'--reasoning-effort high',
					].join(' '),
					source: 'exact',
				});
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});
});
