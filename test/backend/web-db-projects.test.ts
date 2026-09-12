import { Database } from 'bun:sqlite';
import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { DatabaseBaselineError, migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { migrations } from '../../backend/src/db/migrations/registry.ts';
import * as schema from '../../backend/src/db/schema.ts';
import {
	assertAllowedPath,
	canonicalProjectPath,
	encodeProjectId,
} from '../../backend/src/paths.ts';
import {
	beginDataMovementTrace,
	dataMovementTraceHeader,
} from '../../backend/src/services/dataMovementTrace.ts';
import { ProjectNotFoundError, ProjectService } from '../../backend/src/services/projectService.ts';
import { projectProfilePath } from 'aidd-shared/metadata/project-profile';
import { aiddRunDriverKinds } from 'aidd-shared/run-provenance';
import { projectAssuranceProfileFileSchema } from '../../shared/src/contracts/project-profile.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { REJECTED_CATALOG_TYPE, seedSkillCatalogRows } from './fixtures/skill-catalog.fixture.ts';
async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function writeFeature(
	projectDir: string,
	id: string,
	passes: boolean,
	status = passes ? 'completed' : 'backlog',
): Promise<void> {
	await mkdir(join(projectDir, '.aidd', 'features', id), { recursive: true });
	await Bun.write(
		join(projectDir, '.aidd', 'features', id, 'feature.json'),
		JSON.stringify({
			category: 'Core',
			dependencies: [],
			id,
			passes,
			priority: 1,
			status,
			title: id,
		}),
	);
}

async function writeRoadmap(
	projectDir: string,
	roadmap: {
		features: Record<string, { milestone?: string }>;
		milestones: Record<string, Record<string, unknown>>;
	},
): Promise<void> {
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await Bun.write(join(projectDir, '.aidd', 'roadmap.json'), JSON.stringify(roadmap));
}

function webProjectConfig(root: string, ignoredFolders = ['.git', 'node_modules']) {
	return {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [root],
		dataDir: resolve(process.cwd(), 'data'),
		hostname: '127.0.0.1',
		ignoredFolders,
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
}

const EXPECTED_MIGRATION_VERSIONS = [
	'0001_baseline',
	'0002_director_auto_launch_decision',
	'0003_pipeline_step_attempt_identity',
	'0004_director_json_constraints',
	'0005_run_json_domain_constraints',
	'0006_schedule_json_fk_constraints',
	'0007_metrics_diary_constraints',
];

describe('web database and project APIs', () => {
	test('startup migration creates only the web control panel product tables', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);

			const tables = sqlite
				.query<{ name: string }, []>(
					"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
				)
				.all()
				.map((row) => row.name)
				.filter((name) => name !== 'schema_migrations');

			expect(tables).toEqual([
				'app_launches',
				'diary_entries',
				'director_chat_messages',
				'director_chat_sessions',
				'director_cycles',
				'director_profiles',
				'invocation_events',
				'pipeline_sessions',
				'pipeline_step_results',
				'project_init_failures',
				'runs',
				'scheduled_task_executions',
				'scheduled_task_projects',
				'scheduled_tasks',
				'settings',
				'suggestions',
				'system_metrics',
			]);
			const runColumns = sqlite
				.query<{ name: string }, []>('PRAGMA table_info(runs)')
				.all()
				.map((row) => row.name);
			expect(runColumns).toContain('pipeline_session_id');
			expect(runColumns).toContain('provider');
			expect(runColumns).toContain('reasoning_effort');
			expect(runColumns).toContain('heartbeat_at');
			expect(runColumns).toContain('activity_state');
			expect(runColumns).toContain('command_args_json');
			expect(runColumns).toContain('driver_kind');
			expect(runColumns).toContain('driver_id');
			expect(runColumns).toContain('driver_sha256');
			expect(runColumns).toContain('cost_usd');
			expect(runColumns).toContain('reverted_commits');
			expect(runColumns).not.toContain('auto_chain_blocked_reason');
			const scheduledExecutionColumns = sqlite
				.query<{ name: string }, []>('PRAGMA table_info(scheduled_task_executions)')
				.all()
				.map((row) => row.name);
			expect(scheduledExecutionColumns).not.toContain('skip_reason');
			const invocationColumns = sqlite
				.query<{ name: string }, []>('PRAGMA table_info(invocation_events)')
				.all()
				.map((row) => row.name);
			expect(invocationColumns).toContain('resource_sha256');
			const sessionColumns = sqlite
				.query<{ name: string }, []>('PRAGMA table_info(pipeline_sessions)')
				.all()
				.map((row) => row.name);
			expect(sessionColumns).toContain('recipe_sha256');
			const stepResultColumns = sqlite
				.query<{ name: string }, []>('PRAGMA table_info(pipeline_step_results)')
				.all()
				.map((row) => row.name);
			expect(stepResultColumns).toContain('step_definition_id');
			const runsSql = sqlite
				.query<{ sql: string }, [string]>(
					"SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
				)
				.get('runs')?.sql;
			expect(runsSql).toContain('ck_runs_driver_kind');
			// The CHECK vocabulary and the shared union are the same list in the same order.
			const driverKindCheck = /ck_runs_driver_kind[\s\S]*?IN \(([^)]*)\)/.exec(runsSql ?? '');
			expect(
				driverKindCheck?.[1]?.split(',').map((value) => value.trim().replace(/^'|'$/g, '')),
			).toEqual([...aiddRunDriverKinds]);
			expect(() =>
				sqlite.run(
					"INSERT INTO runs (id,project_name,project_path,source,status,mode,backend,started_at,driver_kind) VALUES ('invalid-driver','demo','D:/demo','web','running','coding','native',1,'recipe')",
				),
			).toThrow(/ck_runs_driver_kind/);
			const suggestionColumns = sqlite
				.query<{ name: string }, []>('PRAGMA table_info(suggestions)')
				.all()
				.map((row) => row.name);
			expect(suggestionColumns).toContain('suggested_recipe');
			expect(suggestionColumns).toContain('suggested_args');
			expect(suggestionColumns).toContain('launched_pipeline_session_id');
			expect(suggestionColumns).toContain('rank');
			const profileColumns = sqlite
				.query<{ name: string }, []>('PRAGMA table_info(director_profiles)')
				.all()
				.map((row) => row.name);
			expect(profileColumns).toContain('backend');
			expect(profileColumns).toContain('reasoning_effort');
			const messageColumns = sqlite
				.query<{ name: string }, []>('PRAGMA table_info(director_chat_messages)')
				.all()
				.map((row) => row.name);
			expect(messageColumns).toContain('cycle_id');
		} finally {
			sqlite.close();
		}
	});

	test('startup migration matches the declared runs foreign key shape', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);

			const runForeignKeys = sqlite
				.query<{ from: string }, []>('PRAGMA foreign_key_list(runs)')
				.all()
				.map((row) => row.from)
				.sort();
			expect(runForeignKeys).toEqual([
				'director_cycle_id',
				'pipeline_session_id',
				'scheduled_task_execution_id',
			]);
		} finally {
			sqlite.close();
		}
	});

	test('schema_migrations contains the bundled init version after migration on empty DB', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);

			const versions = sqlite
				.query<{ version: string }, []>(
					'SELECT version FROM schema_migrations ORDER BY version',
				)
				.all()
				.map((row) => row.version);

			expect(versions).toEqual(EXPECTED_MIGRATION_VERSIONS);
		} finally {
			sqlite.close();
		}
	});

	test('calling migrateWebDatabase twice does not re-apply or duplicate version rows', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			migrateWebDatabase(sqlite);

			const versions = sqlite
				.query<{ version: string }, []>(
					'SELECT version FROM schema_migrations ORDER BY version',
				)
				.all()
				.map((row) => row.version);

			expect(versions).toEqual(EXPECTED_MIGRATION_VERSIONS);

			// Verify product tables still have correct schema (no duplicate columns).
			const runColumns = sqlite
				.query<{ name: string }, []>('PRAGMA table_info(runs)')
				.all()
				.map((row) => row.name);
			const pipelineSessionIdCount = runColumns.filter(
				(col) => col === 'pipeline_session_id',
			).length;
			expect(pipelineSessionIdCount).toBe(1);
		} finally {
			sqlite.close();
		}
	});

	function databaseWithForeignLedger(versions: string[]): Database {
		const sqlite = new Database(':memory:');
		const baseline = migrations[0];
		if (baseline === undefined) throw new Error('missing baseline migration');
		sqlite.exec(baseline.sql);
		sqlite.exec(`
			CREATE TABLE schema_migrations (
				version TEXT PRIMARY KEY,
				applied_at INTEGER NOT NULL
			);
		`);
		for (const version of versions) {
			sqlite.run('INSERT INTO schema_migrations VALUES (?, 1)', [version]);
		}
		sqlite.run(
			"INSERT INTO runs (id, project_path, project_name, backend, started_at) VALUES ('r1','/p','p','codex',1)",
		);
		return sqlite;
	}

	test('a database whose tables predate the baseline ledger row is refused with the reset instruction', () => {
		const sqlite = databaseWithForeignLedger([
			'0001_unhinged_taco_party',
			'0008_outcome_analytics',
		]);
		try {
			expect(() => migrateWebDatabase(sqlite)).toThrow(DatabaseBaselineError);
			expect(() => migrateWebDatabase(sqlite)).toThrow(/remove aidd-panel.db/);
			// The refusal leaves the database untouched: no ledger row, no data loss.
			const versions = sqlite
				.query<{ version: string }, []>(
					'SELECT version FROM schema_migrations ORDER BY version',
				)
				.all()
				.map((row) => row.version);
			expect(versions).toEqual(['0001_unhinged_taco_party', '0008_outcome_analytics']);
			expect(
				sqlite.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM runs').get()
					?.count,
			).toBe(1);
		} finally {
			sqlite.close();
		}
	});

	test('a database with product tables and no ledger at all is refused the same way', () => {
		const sqlite = new Database(':memory:');
		try {
			const baseline = migrations[0];
			if (baseline === undefined) throw new Error('missing baseline migration');
			sqlite.exec(baseline.sql);
			expect(() => migrateWebDatabase(sqlite)).toThrow(DatabaseBaselineError);
		} finally {
			sqlite.close();
		}
	});

	test('a database that records the baseline alongside a foreign ledger is accepted as-is', () => {
		const sqlite = databaseWithForeignLedger(['0001_unhinged_taco_party', '0001_baseline']);
		try {
			migrateWebDatabase(sqlite);
			expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
			expect(
				sqlite.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM runs').get()
					?.count,
			).toBe(1);
		} finally {
			sqlite.close();
		}
	});

	test('pipeline session launch-target overrides enforce nullable enum domains', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			sqlite.run(
				`INSERT INTO pipeline_sessions (
				id, project_path, project_name, recipe_id, recipe_name, parameters_json,
				total_steps, started_at, launch_backend, launch_reasoning_effort
			) VALUES ('session-constraints','/project','Project','recipe','Recipe','{}',1,1,NULL,NULL)`,
			);
			sqlite.run(
				"UPDATE pipeline_sessions SET launch_backend = 'openai', launch_reasoning_effort = 'xhigh' WHERE id = 'session-constraints'",
			);

			expect(() =>
				sqlite.run(
					"UPDATE pipeline_sessions SET launch_backend = 'unsupported' WHERE id = 'session-constraints'",
				),
			).toThrow(/ck_pipeline_sessions_launch_backend/);
			expect(() =>
				sqlite.run(
					"UPDATE pipeline_sessions SET launch_reasoning_effort = 'unsupported' WHERE id = 'session-constraints'",
				),
			).toThrow(/ck_pipeline_sessions_launch_reasoning_effort/);
		} finally {
			sqlite.close();
		}
	});

	test('baseline preserves pipeline-session fields, indexes, and child foreign keys', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			sqlite.exec('PRAGMA foreign_keys = ON;');
			sqlite.run(
				`INSERT INTO pipeline_sessions (
					id, project_path, project_name, recipe_id, recipe_name, parameters_json,
					total_steps, started_at, status, launch_backend, launch_model, launch_reasoning_effort
				) VALUES ('session-upgrade','/project','Project','recipe','Recipe','{}',1,1,
					'completed_with_failures','grok','provider-defined','minimal')`,
			);
			sqlite.run(
				"INSERT INTO runs (id, project_path, project_name, backend, started_at, pipeline_session_id) VALUES ('run-upgrade','/project','Project','native',1,'session-upgrade')",
			);
			sqlite.run(
				"INSERT INTO pipeline_step_results (id, session_id, sequence_number, display_order, step_name, step_type) VALUES ('step-upgrade','session-upgrade',1,1,'Step','shell')",
			);
			sqlite.run(
				"INSERT INTO invocation_events (id, resource_type, resource_id, resource_name, source, project_path, project_name, session_id, started_at) VALUES ('event-upgrade','recipe','recipe','Recipe','web','/project','Project','session-upgrade',1)",
			);

			expect(
				sqlite
					.query<
						{
							launch_backend: string;
							launch_model: string;
							launch_reasoning_effort: string;
							status: string;
						},
						[]
					>(
						"SELECT launch_backend, launch_model, launch_reasoning_effort, status FROM pipeline_sessions WHERE id = 'session-upgrade'",
					)
					.get(),
			).toEqual({
				launch_backend: 'grok',
				launch_model: 'provider-defined',
				launch_reasoning_effort: 'minimal',
				status: 'completed_with_failures',
			});
			expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
			const pipelineSessionIndexes = sqlite
				.query<{ name: string }, []>(
					"SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_pipeline_sessions_%' ORDER BY name",
				)
				.all()
				.map((row) => row.name);
			expect(pipelineSessionIndexes).toEqual([
				'idx_pipeline_sessions_project_path',
				'idx_pipeline_sessions_recipe_id',
				'idx_pipeline_sessions_scheduled_execution_id',
				'idx_pipeline_sessions_started_at',
				'idx_pipeline_sessions_status',
			]);
			for (const tableName of [
				'invocation_events',
				'pipeline_step_results',
				'runs',
				'suggestions',
			]) {
				const foreignKeys = sqlite
					.query<{ table: string }, []>(`PRAGMA foreign_key_list(${tableName})`)
					.all();
				expect(
					foreignKeys.some((foreignKey) => foreignKey.table === 'pipeline_sessions'),
				).toBe(true);
			}
		} finally {
			sqlite.close();
		}
	});

	test('baseline accepts supported backends and preserves related rows', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);

			sqlite.run(
				"INSERT INTO runs (id, project_path, project_name, backend, started_at) VALUES ('r1','/p','p','ollama',1)",
			);
			sqlite.run(
				"INSERT INTO invocation_events (id, resource_type, resource_id, resource_name, source, project_path, project_name, backend, started_at, run_id) VALUES ('e1','run','r1','r1','cli','/p','p','native',1,'r1')",
			);
			sqlite.run(
				"INSERT INTO director_profiles (id, backend, created_at, updated_at) VALUES ('d1','native',1,1)",
			);

			// Related rows and their cross-table reference remain intact.
			expect(
				sqlite
					.query<{ backend: string }, []>("SELECT backend FROM runs WHERE id='r1'")
					.get(),
			).toEqual({ backend: 'ollama' });
			expect(
				sqlite
					.query<{ run_id: string }, []>(
						"SELECT run_id FROM invocation_events WHERE id='e1'",
					)
					.get(),
			).toEqual({ run_id: 'r1' });
			expect(
				sqlite
					.query<{ c: number }, []>(
						"SELECT COUNT(*) AS c FROM director_profiles WHERE id='d1'",
					)
					.get(),
			).toEqual({ c: 1 });
			expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);

			// The current backend domain accepts lmstudio on all three tables.
			sqlite.run(
				"INSERT INTO runs (id, project_path, project_name, backend, started_at) VALUES ('r2','/p','p','lmstudio',2)",
			);
			sqlite.run(
				"INSERT INTO invocation_events (id, resource_type, resource_id, resource_name, source, project_path, project_name, backend, started_at) VALUES ('e2','run','r2','r2','cli','/p','p','lmstudio',2)",
			);
			sqlite.run(
				"INSERT INTO director_profiles (id, backend, created_at, updated_at) VALUES ('d2','lmstudio',2,2)",
			);
			expect(
				sqlite
					.query<{ c: number }, []>(
						"SELECT COUNT(*) AS c FROM runs WHERE backend='lmstudio'",
					)
					.get(),
			).toEqual({ c: 1 });

			// An unknown backend is still rejected by the CHECK.
			expect(() =>
				sqlite.run(
					"INSERT INTO runs (id, project_path, project_name, backend, started_at) VALUES ('r3','/p','p','bogus',3)",
				),
			).toThrow();
		} finally {
			sqlite.close();
		}
	});

	test('baseline enforces skill catalog values while preserving relationships and indexes', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			seedSkillCatalogRows(sqlite);

			expect(
				sqlite
					.query<{ recipe_id: string }, []>(
						"SELECT recipe_id FROM pipeline_sessions WHERE id = 'session-1'",
					)
					.get(),
			).toEqual({ recipe_id: 'skill:demo' });
			expect(
				sqlite
					.query<{ step_type: string }, []>(
						"SELECT step_type FROM pipeline_step_results WHERE id = 'step-parent'",
					)
					.get(),
			).toEqual({ step_type: 'skill' });
			expect(
				sqlite
					.query<{ parent_step_result_id: string }, []>(
						"SELECT parent_step_result_id FROM pipeline_step_results WHERE id = 'step-child'",
					)
					.get(),
			).toEqual({ parent_step_result_id: 'step-parent' });
			expect(
				sqlite
					.query<{ resource_type: string }, []>(
						"SELECT resource_type FROM invocation_events WHERE id = 'event-parent'",
					)
					.get(),
			).toEqual({ resource_type: 'skill' });
			expect(
				sqlite
					.query<{ parent_invocation_id: string; parent_resource_type: string }, []>(
						"SELECT parent_invocation_id, parent_resource_type FROM invocation_events WHERE id = 'event-child'",
					)
					.get(),
			).toEqual({ parent_invocation_id: 'event-parent', parent_resource_type: 'skill' });
			expect(
				sqlite
					.query<{ name: string }, []>(
						"SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_pipeline_step_results_display_order'",
					)
					.get(),
			).toEqual({ name: 'idx_pipeline_step_results_display_order' });
			expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
			expect(() =>
				sqlite.run(
					`UPDATE invocation_events SET resource_type = ? WHERE id = 'event-parent'`,
					[REJECTED_CATALOG_TYPE],
				),
			).toThrow();
		} finally {
			sqlite.close();
		}
	});

	test('project service discovers and reads projects only from allowed roots', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		const outsideProjectDir = join(tmpDir, 'outside-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await mkdir(join(outsideProjectDir, '.aidd'), { recursive: true });
		await Bun.write(join(projectDir, '.aidd', 'spec.md'), '# Sample\n');
		await mkdir(join(projectDir, '.aidd', 'iterations'), { recursive: true });
		await Bun.write(
			join(projectDir, '.aidd', 'iterations', '001.json'),
			JSON.stringify({
				backend: 'codex',
				completedFeatures: ['feature-two'],
				durationMs: 1234,
				exitCode: 0,
				iteration: 1,
				outcome: { status: 'success' },
				runId: 'local-run-1',
				selectedFeatures: ['feature-two'],
				startedAt: '2026-05-16T05:00:00.000Z',
				summary: 'coding completed feature-two',
			}),
		);
		await Bun.write(
			join(projectDir, '.aidd', 'runs.jsonl'),
			`${JSON.stringify({
				backend: 'codex',
				durationMs: 2345,
				endedAt: '2026-05-16T05:02:00.000Z',
				exitCode: 0,
				model: 'gpt-5',
				provider: 'openai',
				reasoningEffort: 'high',
				runId: 'local-run-1',
				startedAt: '2026-05-16T05:00:00.000Z',
				stopReason: 'completed',
				summary: 'coding run completed feature-two',
				unattributedDirtySourceFiles: ['src/operator.ts'],
				totals: {
					costUsd: 12.5,
					inputTokens: 1_000,
					outputTokens: 200,
				},
			})}\n`,
		);
		await writeFeature(projectDir, 'feature-one', true);
		await writeFeature(projectDir, 'feature-two', false);
		await writeFeature(outsideProjectDir, 'outside-feature', true);

		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const { projects, skippedRoots } = await service.listProjects();
		expect(projects.map((project) => project.path)).toEqual([resolve(projectDir)]);
		expect(projects[0]?.routeId).toBe('sample-project');
		expect(skippedRoots).toEqual([]);
		expect(projects[0]?.featureStats).toMatchObject({
			failing: 1,
			passing: 1,
			total: 2,
		});
		expect(projects[0]?.metadata.usage).toMatchObject({
			totals: {
				cachedTokens: 0,
				inputTokens: 1_000,
				outputTokens: 200,
				reasoningTokens: 0,
				reportedCostUsd: 12.5,
				runCount: 1,
				runsWithReportedCost: 1,
				runsWithTokenUsage: 1,
				totalTokens: 1_200,
			},
		});
		expect(projects[0]?.metadata.usage.recentDailyTokens).toHaveLength(7);
		expect(
			projects[0]?.metadata.usage.recentDailyTokens.every((point) => point.totalTokens === 0),
		).toBe(true);

		const detail = await service.getProjectDetail(projects[0]!.routeId);
		expect(detail.path).toBe(resolve(projectDir));
		expect(detail.routeId).toBe('sample-project');
		expect(detail.features).toHaveLength(2);
		expect(detail.metadata.profile).toMatchObject({
			bucket: 'single_user_local',
			source: 'inferred',
		});
		expect(await pathExists(join(projectDir, '.aidd', 'project-profile.json'))).toBe(false);
		expect(detail.metadata.localIterations).toMatchObject([
			{
				backend: 'codex',
				completedFeatures: ['feature-two'],
				completionMarkerIssue: null,
				durationMs: 1234,
				endedAt: null,
				exitCode: 0,
				executionMode: null,
				iteration: 1,
				runId: 'local-run-1',
				scopeOverrun: false,
				selectedFeatures: ['feature-two'],
				startedAt: '2026-05-16T05:00:00.000Z',
				status: 'success',
				summary: 'coding completed feature-two',
				triumvirateRoles: null,
			},
		]);
		expect(detail.metadata.localRuns).toEqual([
			{
				aiddDirty: null,
				aiddRevision: null,
				aiddVersion: null,
				aiSummary: null,
				artifactWarnings: [],
				backend: 'codex',
				backendExitCode: null,
				commitsCreated: [],
				commitsCreatedCount: 0,
				completedFeatures: [],
				durationMs: 2345,
				endedAt: '2026-05-16T05:02:00.000Z',
				exitCode: 0,
				executionMode: null,
				filesCreated: 0,
				filesEdited: 0,
				mode: null,
				phase: null,
				model: 'gpt-5',
				provider: 'openai',
				reasoningEffort: 'high',
				residualDirtySourceFiles: [],
				residualUntrackedFeatureDirs: [],
				runId: 'local-run-1',
				runLedgerDirty: false,
				scopeOverrun: false,
				source: null,
				startedAt: '2026-05-16T05:00:00.000Z',
				stopReason: 'completed',
				summary: 'coding run completed feature-two',
				triumvirateRoles: null,
				unattributedDirtySourceFiles: ['src/operator.ts'],
			},
		]);
		expect(detail.metadata.sync).toEqual({
			lastSyncAt: '2026-05-16T05:02:00.000Z',
			lastSyncError: null,
			preferredCli: 'codex',
			preferredModel: 'gpt-5',
			preferredProvider: 'openai',
			preferredReasoningEffort: 'high',
			syncState: 'idle',
		});
		expect(() => assertAllowedPath([allowedRoot], outsideProjectDir)).toThrow(
			'Path is outside allowed roots',
		);
	});

	test('project service disambiguates duplicate project slugs with short route IDs', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-project-route-ids-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const firstProject = join(allowedRoot, 'one', 'sample');
		const secondProject = join(allowedRoot, 'two', 'sample');
		await mkdir(join(firstProject, '.aidd'), { recursive: true });
		await mkdir(join(secondProject, '.aidd'), { recursive: true });

		const service = new ProjectService(webProjectConfig(allowedRoot));
		const { projects } = await service.listProjects();
		expect(projects).toHaveLength(2);
		const routeIds = projects.map((project) => project.routeId);
		expect(routeIds[0]).toMatch(/^sample~[a-f0-9]{8,}$/);
		expect(routeIds[1]).toMatch(/^sample~[a-f0-9]{8,}$/);
		expect(new Set(routeIds).size).toBe(2);
		for (const project of projects) {
			const detail = await service.getProjectDetail(project.routeId);
			expect(detail.path).toBe(project.path);
		}
		await expect(service.getProjectDetail('sample')).rejects.toThrow('Ambiguous project name');
	});

	test('project listing flags the spernakit template checkout by name + generator', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-spernakit-flag-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const withGenerator = join(allowedRoot, 'one', 'spernakit');
		const withoutGenerator = join(allowedRoot, 'two', 'spernakit');
		const ordinary = join(allowedRoot, 'ordinary-app');
		await mkdir(join(withGenerator, '.aidd'), { recursive: true });
		await mkdir(join(withGenerator, 'scripts'), { recursive: true });
		await Bun.write(join(withGenerator, 'scripts', 'init.ts'), '// portable generator');
		await mkdir(join(withoutGenerator, '.aidd'), { recursive: true });
		await mkdir(join(ordinary, '.aidd'), { recursive: true });

		const service = new ProjectService(webProjectConfig(allowedRoot));
		const { projects } = await service.listProjects();
		const byPath = new Map(projects.map((project) => [project.path, project]));
		expect(byPath.get(resolve(withGenerator))?.isSpernakitTemplate).toBe(true);
		expect(byPath.get(resolve(withoutGenerator))?.isSpernakitTemplate).toBeUndefined();
		expect(byPath.get(resolve(ordinary))?.isSpernakitTemplate).toBeUndefined();
	});

	test('names endpoint carries the same template flag the full listing does', async () => {
		// The sidebar count reads this endpoint and hides the template on the same setting the
		// projects page uses. Without the flag here the badge reads one higher than the page.
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-project-names-spk-flag-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const template = join(allowedRoot, 'spernakit');
		const ordinary = join(allowedRoot, 'ordinary-app');
		await mkdir(join(template, '.aidd'), { recursive: true });
		await mkdir(join(template, 'scripts'), { recursive: true });
		await Bun.write(join(template, 'scripts', 'init.ts'), '// portable generator');
		await mkdir(join(ordinary, '.aidd'), { recursive: true });

		const service = new ProjectService(webProjectConfig(allowedRoot));
		const { projects } = await service.listProjectNames();
		const byPath = new Map(projects.map((project) => [project.path, project]));
		expect(byPath.get(resolve(template))?.isSpernakitTemplate).toBe(true);
		expect(byPath.get(resolve(ordinary))?.isSpernakitTemplate).toBeUndefined();
	});

	test('project listing reports the spernakit template checkout version', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-spk-version-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const checkout = join(tmpDir, 'spernakit');
		await mkdir(join(allowedRoot, 'app', '.aidd'), { recursive: true });
		await mkdir(join(checkout, 'scripts'), { recursive: true });
		await Bun.write(join(checkout, 'scripts', 'init.ts'), '// portable generator');
		await Bun.write(join(checkout, 'package.json'), JSON.stringify({ version: '3.24.1' }));

		const withCheckout = new ProjectService({
			...webProjectConfig(allowedRoot),
			spernakitInitScript: join(checkout, 'init.ps1'),
		});
		expect((await withCheckout.listProjects()).spernakitTemplateVersion).toBe('3.24.1');

		// No configured checkout and no cached clone under dataDir → unknown.
		const withoutCheckout = new ProjectService({
			...webProjectConfig(allowedRoot),
			dataDir: join(tmpDir, 'data'),
		});
		expect((await withoutCheckout.listProjects()).spernakitTemplateVersion).toBeNull();
	});

	test('project service writes explicit assurance profiles and rejects invalid values', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-profile-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});
		const projectId = encodeProjectId(projectDir);

		const profile = await service.updateProjectProfile(projectId, {
			authMode: 'tenant_rbac',
			bucket: 'public_multi_tenant',
			criticality: 'business_critical',
			dataSensitivity: 'regulated',
			deployment: 'cloud',
			derivesFromTemplate: 'none',
			externalIntegrations: 'financial_or_security',
			hasCliBinary: 'none',
			notes: 'Hosted customer-facing app.',
			publishesReleaseArchives: 'binary_archives',
			shipsContainerImage: 'published',
		});

		expect(profile).toMatchObject({
			authMode: 'tenant_rbac',
			bucket: 'public_multi_tenant',
			source: 'explicit',
		});
		expect(typeof profile.updatedAt).toBe('string');
		const written = JSON.parse(
			await readFile(join(projectDir, '.aidd', 'project-profile.json'), 'utf8'),
		) as { bucket?: string; source?: string };
		expect(written).toMatchObject({ bucket: 'public_multi_tenant', source: 'explicit' });
		for (const required of projectAssuranceProfileFileSchema.required) {
			expect(written).toHaveProperty(required);
		}
		await expect(
			service.updateProjectProfile(projectId, {
				authMode: 'local_owner',
				bucket: 'not-real' as 'single_user_local',
				criticality: 'utility',
				dataSensitivity: 'low',
				deployment: 'local',
				derivesFromTemplate: 'none',
				externalIntegrations: 'none',
				hasCliBinary: 'none',
				publishesReleaseArchives: 'none',
				shipsContainerImage: 'none',
			}),
		).rejects.toThrow('Invalid project profile field: bucket');
	});

	test('profile saves invalidate the listing cache before an immediate refetch', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-profile-listing-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		const service = new ProjectService(webProjectConfig(allowedRoot));
		const projectId = encodeProjectId(projectDir);

		const before = (await service.listProjects()).projects.find(
			(project) => project.id === projectId,
		);
		expect(before?.metadata.profile.source).toBe('inferred');

		const saved = await service.updateProjectProfile(projectId, {
			authMode: 'local_owner',
			bucket: 'single_user_local',
			criticality: 'operational',
			dataSensitivity: 'low',
			deployment: 'local',
			derivesFromTemplate: 'none',
			externalIntegrations: 'none',
			hasCliBinary: 'none',
			notes: 'Saved from the profile matrix.',
			publishesReleaseArchives: 'none',
			shipsContainerImage: 'none',
		});

		const after = (await service.listProjects()).projects.find(
			(project) => project.id === projectId,
		);
		expect(after?.metadata.profile).toEqual(saved);
		expect(after?.metadata.profile.updatedAt).toBe(saved.updatedAt);
	});

	test('updateProjectProfile records the actual project-profile.json write path', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-profile-trace-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});
		const projectId = encodeProjectId(projectDir);

		beginDataMovementTrace('profile-trace-test');
		await service.updateProjectProfile(projectId, {
			authMode: 'local_owner',
			bucket: 'single_user_local',
			criticality: 'utility',
			dataSensitivity: 'low',
			deployment: 'local',
			derivesFromTemplate: 'none',
			externalIntegrations: 'none',
			hasCliBinary: 'none',
			publishesReleaseArchives: 'none',
			shipsContainerImage: 'none',
		});
		const header = JSON.parse(dataMovementTraceHeader()) as {
			events: { operation: string; target?: string }[];
		};

		const profileEvent = header.events.find((event) => event.operation === 'project.profile');
		expect(profileEvent).toBeDefined();
		expect(profileEvent?.target).toBe('.aidd/project-profile.json');
		const writtenFileExists = await pathExists(projectProfilePath(projectDir));
		expect(writtenFileExists).toBe(true);
		expect(await pathExists(join(projectDir, '.aidd', 'profile.json'))).toBe(false);
	});

	test('project service skips configured ignored folders during discovery', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-ignore-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const visibleProject = join(allowedRoot, 'visible-project');
		const ignoredProject = join(allowedRoot, 'generated', 'hidden-project');
		await mkdir(join(visibleProject, '.aidd'), { recursive: true });
		await mkdir(join(ignoredProject, '.aidd'), { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
			hostname: '127.0.0.1',
			ignoredFolders: ['generated'],
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
		});

		const { projects } = await service.listProjects();

		expect(projects.map((project) => project.path)).toEqual([resolve(visibleProject)]);
	});

	test('project service skips ignored folders matching a glob pattern', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-glob-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const visibleProject = join(allowedRoot, 'visible-project');
		const ignoredProject = join(allowedRoot, 'archive.old', 'hidden-project');
		await mkdir(join(visibleProject, '.aidd'), { recursive: true });
		await mkdir(join(ignoredProject, '.aidd'), { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
			hostname: '127.0.0.1',
			ignoredFolders: ['*.old'],
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
		});

		const { projects } = await service.listProjects();

		expect(projects.map((project) => project.path)).toEqual([resolve(visibleProject)]);
	});

	test('project service attributes projects to the most specific configured root', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-root-'));
		const outerRoot = join(tmpDir, 'applications');
		const innerRoot = join(outerRoot, 'team');
		const outerProject = join(outerRoot, 'outer-project');
		const nestedProject = join(innerRoot, 'nested-project');
		const missingRoot = join(tmpDir, 'missing-root');
		await mkdir(join(outerProject, '.aidd'), { recursive: true });
		await mkdir(join(nestedProject, '.aidd'), { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [outerRoot, innerRoot, missingRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const { projects, skippedRoots } = await service.listProjects();
		const byPath = new Map(projects.map((project) => [project.path, project]));

		expect(projects.map((project) => project.path)).toEqual([
			resolve(outerProject),
			resolve(nestedProject),
		]);
		expect(byPath.get(resolve(outerProject))?.root).toBe(resolve(outerRoot));
		expect(byPath.get(resolve(nestedProject))?.root).toBe(resolve(innerRoot));
		expect(skippedRoots).toEqual([
			{
				path: resolve(missingRoot),
				reason: 'Configured root does not exist or is not a directory',
			},
		]);
	});

	test('project service deduplicates project when a root is also an ancestor of another root', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-dedup-'));
		const outerRoot = join(tmpDir, 'applications');
		const projectDir = join(outerRoot, 'aidd');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		// Both outerRoot and projectDir are listed as allowedRoots — projectDir
		// is also a child of outerRoot, so scanRoot would discover it from both.
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [outerRoot, projectDir],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const { projects } = await service.listProjects();

		// Must see exactly one project, not a duplicate with a mangled name.
		expect(projects).toHaveLength(1);
		expect(projects[0]?.name).toBe('aidd');
		expect(projects[0]?.path).toBe(resolve(projectDir));
	});

	test('project service lists import candidates with ignored and duplicate filtering', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-import-list-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const candidateDir = join(allowedRoot, 'candidate-project');
		const existingProject = join(allowedRoot, 'existing-project');
		const ignoredProject = join(allowedRoot, 'generated', 'hidden-project');
		await mkdir(candidateDir, { recursive: true });
		await mkdir(join(existingProject, '.aidd'), { recursive: true });
		await mkdir(ignoredProject, { recursive: true });
		await Bun.write(join(candidateDir, 'package.json'), '{"name":"candidate-project"}');
		await Bun.write(join(ignoredProject, 'package.json'), '{"name":"hidden-project"}');
		const service = new ProjectService(webProjectConfig(allowedRoot, ['generated']));

		const { candidates, skippedRoots } = await service.listImportCandidates();

		expect(skippedRoots).toEqual([]);
		expect(candidates.map((candidate) => candidate.path)).toEqual([resolve(candidateDir)]);
		expect(candidates[0]).toMatchObject({
			canImport: true,
			name: 'candidate-project',
			reason: null,
			signals: { aidd: false, git: false, packageJson: true },
		});
	});

	test('project service registers selected candidates without launching anything', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-import-run-'));
		const candidateDir = join(tmpDir, 'candidate-project');
		await mkdir(candidateDir, { recursive: true });
		await Bun.write(join(candidateDir, 'package.json'), '{"name":"candidate-project"}');
		const service = new ProjectService(webProjectConfig(tmpDir));
		const { candidates } = await service.listImportCandidates();
		const candidate = candidates[0];
		expect(candidate).toBeDefined();
		if (!candidate) throw new Error('Expected import candidate');
		const launched: string[] = [];

		const result = await service.importProjects([candidate.id], 'register', async (dir) => {
			launched.push(dir);
			return { id: 'session-unexpected' };
		});

		expect(result.results).toEqual([
			{
				candidateId: candidate.id,
				error: null,
				intakeSessionId: null,
				path: resolve(candidateDir),
				projectId: encodeProjectId(candidateDir),
				runId: null,
				status: 'imported',
			},
		]);
		expect(launched).toEqual([]);
		expect(await pathExists(join(candidateDir, '.aidd', 'features'))).toBe(true);
		expect(await pathExists(join(candidateDir, '.aidd', 'iterations'))).toBe(true);
		const { projects } = await service.listProjects();
		expect(projects.map((project) => project.path)).toEqual([resolve(candidateDir)]);
	});

	test('project service ingests candidates by launching the intake pipeline', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-import-ingest-'));
		const candidateDir = join(tmpDir, 'candidate-project');
		await mkdir(candidateDir, { recursive: true });
		await Bun.write(join(candidateDir, 'package.json'), '{"name":"candidate-project"}');
		const service = new ProjectService(webProjectConfig(tmpDir));
		const { candidates } = await service.listImportCandidates();
		const candidate = candidates[0];
		expect(candidate).toBeDefined();
		if (!candidate) throw new Error('Expected import candidate');
		const launched: { dir: string; launchTarget: LaunchTargetOverrides }[] = [];

		const result = await service.importProjects(
			[candidate.id],
			'ingest',
			async (dir, launchTarget) => {
				launched.push({ dir, launchTarget });
				return { id: 'intake-session-1' };
			},
			{ backend: 'native', model: 'intake-model', reasoningEffort: 'high' },
		);

		expect(result.results).toEqual([
			{
				candidateId: candidate.id,
				error: null,
				intakeSessionId: 'intake-session-1',
				path: resolve(candidateDir),
				projectId: encodeProjectId(candidateDir),
				runId: null,
				status: 'imported',
			},
		]);
		expect(launched).toEqual([
			{
				dir: resolve(candidateDir),
				launchTarget: {
					backend: 'native',
					model: 'intake-model',
					reasoningEffort: 'high',
				},
			},
		]);
		expect(await pathExists(join(candidateDir, '.aidd', 'features'))).toBe(true);
	});

	test('project service keeps registration when intake launch fails', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-import-fail-'));
		const candidateDir = join(tmpDir, 'candidate-project');
		await mkdir(candidateDir, { recursive: true });
		await Bun.write(join(candidateDir, 'package.json'), '{"name":"candidate-project"}');
		const service = new ProjectService(webProjectConfig(tmpDir));
		const { candidates } = await service.listImportCandidates();
		const candidate = candidates[0];
		expect(candidate).toBeDefined();
		if (!candidate) throw new Error('Expected import candidate');

		const result = await service.importProjects([candidate.id], 'ingest', async () => {
			throw new Error('pipeline unavailable');
		});

		expect(result.results).toEqual([
			{
				candidateId: candidate.id,
				error: 'Registered, but intake launch failed: pipeline unavailable',
				intakeSessionId: null,
				path: resolve(candidateDir),
				projectId: encodeProjectId(candidateDir),
				runId: null,
				status: 'imported',
			},
		]);
		expect(await pathExists(join(candidateDir, '.aidd'))).toBe(true);
	});

	test('project service rejects undiscovered project IDs without filesystem mutation', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-projects-nf-'));
		const allowedRoot = join(tmpDir, 'allowed');
		await mkdir(allowedRoot, { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const before = await readdir(allowedRoot);

		// 1. malformed base64url id rejected
		await expect(service.getProjectDetail('not-a-real-project!!')).rejects.toBeInstanceOf(
			ProjectNotFoundError,
		);

		// 2. base64url-shaped but decodes to nonexistent path inside allowed root
		const bogusId = 'not-a-real-project';
		await expect(service.getProjectDetail(bogusId)).rejects.toBeInstanceOf(
			ProjectNotFoundError,
		);

		// 3. encoded path that points outside any allowed root
		const outsideId = encodeProjectId(join(tmpDir, 'some-other-place'));
		await expect(service.getProjectDetail(outsideId)).rejects.toBeInstanceOf(
			ProjectNotFoundError,
		);

		// 4. encoded path inside allowed root but with no .aidd metadata
		const emptyDir = join(allowedRoot, 'empty-not-a-project');
		await mkdir(emptyDir, { recursive: true });
		const emptyId = encodeProjectId(emptyDir);
		await expect(service.getProjectDetail(emptyId)).rejects.toBeInstanceOf(
			ProjectNotFoundError,
		);

		// Verify NO artifact-check file or stray dir was created under the allowed root
		const after = await readdir(allowedRoot);
		expect(after.sort()).toEqual([...before, 'empty-not-a-project'].sort());
		// empty-not-a-project must not have gained an .aidd directory
		const emptyContents = await readdir(emptyDir);
		expect(emptyContents).toEqual([]);
	});

	test('project service updates backlog feature status inline', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-feature-status-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFeature(projectDir, 'feature-status', false);
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const updated = await service.features.updateFeatureStatus(
			encodeProjectId(projectDir),
			'feature-status',
			'in_progress',
		);

		expect(updated).toMatchObject({
			id: 'feature-status',
			passes: false,
			status: 'in_progress',
		});
	});

	test('project service updates feature milestone without rewriting feature metadata', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-feature-milestone-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFeature(projectDir, 'feature-roadmap', false);
		await writeRoadmap(projectDir, {
			milestones: { MVP: {}, 'v1.0': {} },
			features: { 'feature-roadmap': { milestone: 'MVP' } },
		});
		const featurePath = join(
			projectDir,
			'.aidd',
			'features',
			'feature-roadmap',
			'feature.json',
		);
		const beforeFeature = await readFile(featurePath, 'utf8');
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const updated = await service.features.updateFeatureMilestone(
			encodeProjectId(projectDir),
			'feature-roadmap',
			'v1.0',
		);
		const roadmap = JSON.parse(
			await readFile(join(projectDir, '.aidd', 'roadmap.json'), 'utf8'),
		) as { features: Record<string, { milestone?: string }> };

		expect(updated.feature).toMatchObject({ id: 'feature-roadmap', milestone: 'v1.0' });
		expect(roadmap.features['feature-roadmap']?.milestone).toBe('v1.0');
		expect(await readFile(featurePath, 'utf8')).toBe(beforeFeature);
	});

	test('project service rejects invalid milestone assignment requests', async () => {
		const tmpDir = canonicalProjectPath(
			await testTempDir('aidd-web-feature-milestone-invalid-'),
		);
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFeature(projectDir, 'feature-roadmap', false);
		await writeRoadmap(projectDir, {
			milestones: { MVP: {} },
			features: { 'feature-roadmap': { milestone: 'MVP' } },
		});
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		await expect(
			service.features.updateFeatureMilestone(
				encodeProjectId(projectDir),
				'feature-roadmap',
				'v9',
			),
		).rejects.toThrow('Unknown roadmap milestone');
		await expect(
			service.features.updateFeatureMilestone(encodeProjectId(projectDir), '../bad', 'MVP'),
		).rejects.toThrow('Invalid feature id');

		const noRoadmapDir = join(allowedRoot, 'no-roadmap-project');
		await mkdir(join(noRoadmapDir, '.aidd'), { recursive: true });
		await writeFeature(noRoadmapDir, 'feature-roadmap', false);
		await expect(
			service.features.updateFeatureMilestone(
				encodeProjectId(noRoadmapDir),
				'feature-roadmap',
				'MVP',
			),
		).rejects.toThrow('Project has no roadmap.json');
	});

	test('project detail includes feature milestones and roadmap diagnostics', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-feature-roadmap-detail-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFeature(projectDir, 'feature-assigned', false);
		await writeFeature(projectDir, 'feature-unassigned', false);
		await writeFeature(projectDir, 'feature-invalid', false);
		await writeRoadmap(projectDir, {
			milestones: { MVP: {}, 'v1.0': {} },
			features: {
				'feature-assigned': { milestone: 'MVP' },
				'feature-invalid': { milestone: 'v9' },
			},
		});
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const detail = await service.getProjectDetail(encodeProjectId(projectDir));
		const byId = new Map(detail.features.map((feature) => [feature.id, feature]));

		expect(byId.get('feature-assigned')?.milestone).toBe('MVP');
		expect(byId.get('feature-unassigned')?.milestone).toBeNull();
		expect(detail.metadata.roadmap?.milestoneOrder).toEqual(['MVP', 'v1.0']);
		expect(detail.metadata.roadmap?.unmappedFeatureDirectories).toEqual(['feature-unassigned']);
		expect(detail.metadata.roadmap?.invalidMappings).toEqual([
			{ featureDirectory: 'feature-invalid', milestone: 'v9' },
		]);
	});

	test('project detail surfaces the blocking context of a parked feature', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-blocking-context-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd', 'features', 'feature-parked'), { recursive: true });
		await Bun.write(
			join(projectDir, '.aidd', 'features', 'feature-parked', 'feature.json'),
			JSON.stringify({
				blockingContext: {
					commands: ['bun run smoke:qc'],
					outcomeStatus: 'completion_pending_commit',
					outputExcerpt: 'max-lines violation: file exceeds 300 lines',
					parkedAt: '2026-07-04T12:00:00.000Z',
					reason: 'completion_pending_commit',
				},
				category: 'Core',
				dependencies: [],
				id: 'feature-parked',
				passes: false,
				priority: 1,
				status: 'waiting_approval',
				title: 'feature-parked',
			}),
		);
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const detail = await service.getProjectDetail(encodeProjectId(projectDir));
		const parked = detail.features.find((feature) => feature.id === 'feature-parked');
		expect(parked?.blockingContext).toEqual({
			commands: ['bun run smoke:qc'],
			outcomeStatus: 'completion_pending_commit',
			outputExcerpt: 'max-lines violation: file exceeds 300 lines',
			parkedAt: '2026-07-04T12:00:00.000Z',
			reason: 'completion_pending_commit',
		});
	});

	test('project service records approval metadata before returning feature to backlog', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-feature-approval-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFeature(projectDir, 'feature-decision', false, 'waiting_approval');
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const approved = await service.features.approveFeature(
			encodeProjectId(projectDir),
			'feature-decision',
			{
				decision: 'Use display_order only.',
				decisionRequired: true,
			},
		);

		expect(approved).toMatchObject({
			approval: {
				decision: 'Use display_order only.',
				decisionRequired: true,
				source: 'web-ui',
			},
			passes: false,
			status: 'backlog',
		});
		const approval = approved.approval as { approvedAt?: unknown };
		expect(typeof approval.approvedAt).toBe('string');
	});

	test('approving a parked post-MVP feature returns it to backlog despite the roadmap', async () => {
		const tmpDir = canonicalProjectPath(
			await testTempDir('aidd-web-feature-approval-roadmap-'),
		);
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		// The creation-parking policy in FileAiddStore only applies to brand-new features;
		// approval writes to an existing file and must never be re-parked by the roadmap.
		await Bun.write(
			join(projectDir, '.aidd', 'roadmap.json'),
			JSON.stringify({
				features: { 'feature-parked': { milestone: 'v1.0' } },
				milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
			}),
		);
		await writeFeature(projectDir, 'feature-parked', false, 'waiting_approval');
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const approved = await service.features.approveFeature(
			encodeProjectId(projectDir),
			'feature-parked',
			{
				decision: null,
				decisionRequired: false,
			},
		);

		expect(approved.status).toBe('backlog');
		expect(approved.passes).toBe(false);
		const onDisk = JSON.parse(
			await readFile(
				join(projectDir, '.aidd', 'features', 'feature-parked', 'feature.json'),
				'utf8',
			),
		) as { status?: string };
		expect(onDisk.status).toBe('backlog');
	});

	test('project service rejects decision-required approval without a decision', async () => {
		const tmpDir = canonicalProjectPath(
			await testTempDir('aidd-web-feature-approval-required-'),
		);
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFeature(projectDir, 'feature-decision-required', false, 'waiting_approval');
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		await expect(
			service.features.approveFeature(
				encodeProjectId(projectDir),
				'feature-decision-required',
				{
					decision: null,
					decisionRequired: true,
				},
			),
		).rejects.toThrow('Approval decision is required');
	});

	test('project service deletes backlog and waiting approval feature directories', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-feature-delete-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFeature(projectDir, 'feature-delete-backlog', false);
		await writeFeature(projectDir, 'feature-delete-waiting', false, 'waiting_approval');
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		await service.features.deleteFeature(encodeProjectId(projectDir), 'feature-delete-backlog');
		await service.features.deleteFeature(encodeProjectId(projectDir), 'feature-delete-waiting');

		const remaining = await readdir(join(projectDir, '.aidd', 'features'));
		expect(remaining).toEqual([]);
	});

	test('project service removes the roadmap entry when deleting a feature', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-feature-delete-roadmap-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFeature(projectDir, 'feature-keep', false);
		await writeFeature(projectDir, 'feature-drop', false);
		await writeRoadmap(projectDir, {
			milestones: { MVP: {} },
			features: {
				'feature-keep': { milestone: 'MVP' },
				'feature-drop': { milestone: 'MVP' },
			},
		});
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		await service.features.deleteFeature(encodeProjectId(projectDir), 'feature-drop');

		const roadmap = JSON.parse(
			await readFile(join(projectDir, '.aidd', 'roadmap.json'), 'utf8'),
		) as { features: Record<string, { milestone?: string }> };
		expect(roadmap.features['feature-drop']).toBeUndefined();
		expect(roadmap.features['feature-keep']?.milestone).toBe('MVP');
	});

	test('project service deletes project metadata only after exact path confirmation', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-project-delete-'));
		const allowedRoot = join(tmpDir, 'allowed');
		const projectDir = join(allowedRoot, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [allowedRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});
		const projectId = encodeProjectId(projectDir);

		await expect(
			service.deleteProject(
				projectId,
				{ confirmation: 'sample-project', mode: 'metadata' },
				async () => false,
				async () => 0,
			),
		).rejects.toThrow('Project path confirmation does not match');
		await service.deleteProject(
			projectId,
			{ confirmation: resolve(projectDir), mode: 'metadata' },
			async () => false,
			async () => 0,
		);

		expect(await pathExists(projectDir)).toBe(true);
		expect(await pathExists(join(projectDir, '.aidd'))).toBe(false);
	});

	test('project service blocks project deletion while active runs exist', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-project-delete-active-'));
		const projectDir = join(tmpDir, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [tmpDir],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		await expect(
			service.deleteProject(
				encodeProjectId(projectDir),
				{ confirmation: resolve(projectDir), mode: 'directory' },
				async () => true,
				async () => 0,
			),
		).rejects.toThrow('Project has active runs');
		expect(await pathExists(projectDir)).toBe(true);
	});

	test('project service blocks deletion while a scheduled task references it', async () => {
		const tmpDir = canonicalProjectPath(
			await testTempDir('aidd-web-project-delete-scheduled-'),
		);
		const projectDir = join(tmpDir, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		const service = new ProjectService(webProjectConfig(tmpDir));

		await expect(
			service.deleteProject(
				encodeProjectId(projectDir),
				{ confirmation: resolve(projectDir), mode: 'directory' },
				async () => false,
				async () => 0,
				async () => true,
			),
		).rejects.toThrow('Project is referenced by a scheduled task');
		expect(await pathExists(projectDir)).toBe(true);
	});

	test('project service moves projects between configured roots and reports new id', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-project-move-'));
		const sourceRoot = join(tmpDir, 'source');
		const destinationRoot = join(tmpDir, 'destination');
		const sourceProject = join(sourceRoot, 'sample-project');
		await mkdir(join(sourceProject, '.aidd'), { recursive: true });
		await mkdir(destinationRoot, { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [sourceRoot, destinationRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});
		const updates: { destinationPath: string; sourcePath: string }[] = [];

		const moved = await service.moveProject(
			encodeProjectId(sourceProject),
			{
				confirmation: sourceProject,
				destinationName: 'renamed-project',
				destinationRoot,
			},
			async () => false,
			async (sourcePath, destinationPath) => {
				updates.push({ destinationPath, sourcePath });
			},
		);

		expect(moved.path).toBe(resolve(join(destinationRoot, 'renamed-project')));
		expect(moved.id).toBe(encodeProjectId(moved.path));
		expect(await pathExists(sourceProject)).toBe(false);
		expect(await pathExists(join(moved.path, '.aidd'))).toBe(true);
		expect(updates).toEqual([
			{
				destinationPath: moved.path,
				sourcePath: resolve(sourceProject),
			},
		]);
	});

	test('project service renames a project in place via a same-root move', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-project-rename-'));
		const root = join(tmpDir, 'root');
		const sourceProject = join(root, 'sample-project');
		await mkdir(join(sourceProject, '.aidd'), { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [root],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		const moved = await service.moveProject(
			encodeProjectId(sourceProject),
			{
				confirmation: sourceProject,
				destinationName: 'renamed-project',
				destinationRoot: root,
			},
			async () => false,
			async () => {},
		);

		expect(moved.path).toBe(resolve(join(root, 'renamed-project')));
		expect(moved.id).toBe(encodeProjectId(moved.path));
		expect(await pathExists(sourceProject)).toBe(false);
		expect(await pathExists(join(moved.path, '.aidd'))).toBe(true);

		await expect(
			service.moveProject(
				encodeProjectId(moved.path),
				{
					confirmation: moved.path,
					destinationName: 'renamed-project',
					destinationRoot: root,
				},
				async () => false,
				async () => {},
			),
		).rejects.toThrow('Project is already at that destination');
	});

	test.skipIf(process.platform !== 'win32')(
		'project service reports a locked Windows project directory as a move conflict',
		async () => {
			const tmpDir = canonicalProjectPath(
				await testTempDir('aidd-web-project-rename-locked-'),
			);
			const root = join(tmpDir, 'root');
			const sourceProject = join(root, 'sample-project');
			const destinationProject = join(root, 'renamed-project');
			await mkdir(join(sourceProject, '.aidd'), { recursive: true });
			const service = new ProjectService({
				allowRemote: false,
				allowedOrigins: [],
				allowedRoots: [root],
				dataDir: resolve(process.cwd(), 'data'),
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
			});
			const child = Bun.spawn([process.execPath, '-e', 'setTimeout(() => {}, 60_000)'], {
				cwd: sourceProject,
				stderr: 'ignore',
				stdin: 'ignore',
				stdout: 'ignore',
				windowsHide: true,
			});
			try {
				await Bun.sleep(100);
				let error: unknown = null;
				try {
					await service.moveProject(
						encodeProjectId(sourceProject),
						{
							confirmation: sourceProject,
							destinationName: 'renamed-project',
							destinationRoot: root,
						},
						async () => false,
						async () => {},
					);
				} catch (err) {
					error = err;
				}

				expect(error).toBeInstanceOf(Error);
				expect((error as { status?: unknown }).status).toBe(409);
				expect(error instanceof Error ? error.message : '').toContain('folder is in use');
				expect(await pathExists(sourceProject)).toBe(true);
				expect(await pathExists(destinationProject)).toBe(false);
			} finally {
				child.kill();
				await child.exited;
			}
		},
	);

	test('project service rejects move collisions and preserves source project', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-project-move-collision-'));
		const sourceRoot = join(tmpDir, 'source');
		const destinationRoot = join(tmpDir, 'destination');
		const sourceProject = join(sourceRoot, 'sample-project');
		const existingDestination = join(destinationRoot, 'sample-project');
		await mkdir(join(sourceProject, '.aidd'), { recursive: true });
		await mkdir(existingDestination, { recursive: true });
		const service = new ProjectService({
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [sourceRoot, destinationRoot],
			dataDir: resolve(process.cwd(), 'data'),
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
		});

		await expect(
			service.moveProject(
				encodeProjectId(sourceProject),
				{ confirmation: sourceProject, destinationRoot },
				async () => false,
				async () => {},
			),
		).rejects.toThrow('Destination path already exists');
		expect(await pathExists(sourceProject)).toBe(true);
		expect(await pathExists(existingDestination)).toBe(true);
	});
});

describe('purgeProjectRuns command', () => {
	test('deletes path-keyed runs, pipeline sessions, and invocations for one project only', async () => {
		const sqlite = new Database(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON;');
		migrateWebDatabase(sqlite);
		const { db, commands } = wrapWebDatabase(sqlite);

		const now = Date.now();
		const target = resolve('/projects/margin-planner');
		const other = resolve('/projects/keepme');

		// Seed two projects at distinct paths, each with a run, a pipeline session (plus a step
		// result child), and an invocation event — so the purge has every path-keyed table to clear.
		for (const [suffix, projectPath] of [
			['target', target],
			['other', other],
		] as const) {
			await db.insert(schema.pipelineSessions).values({
				id: `sess-${suffix}`,
				parametersJson: '{}',
				projectName: suffix,
				projectPath,
				recipeId: 'recipe-1',
				recipeName: 'Recipe',
				startedAt: now,
				status: 'completed',
				totalSteps: 1,
			});
			await db.insert(schema.pipelineStepResults).values({
				displayOrder: 0,
				id: `step-${suffix}`,
				sequenceNumber: 0,
				sessionId: `sess-${suffix}`,
				startedAt: now,
				status: 'completed',
				stepName: 'Step',
				stepType: 'aidd-cli',
			});
			await db.insert(schema.runs).values({
				backend: 'native',
				id: `run-${suffix}`,
				projectName: suffix,
				projectPath,
				startedAt: now,
				status: 'failed',
			});
			await db.insert(schema.invocationEvents).values({
				id: `inv-${suffix}`,
				projectName: suffix,
				projectPath,
				resourceId: 'resource-1',
				resourceName: 'Resource',
				resourceType: 'run',
				source: 'web',
				startedAt: now,
				status: 'completed',
			});
		}

		const purged = await commands.purgeProjectRuns({ projectPath: target });
		expect(purged).toBe(1);

		const remainingRuns = sqlite
			.query<{ id: string }, []>('SELECT id FROM runs ORDER BY id')
			.all()
			.map((row) => row.id);
		expect(remainingRuns).toEqual(['run-other']);

		const remainingSessions = sqlite
			.query<{ id: string }, []>('SELECT id FROM pipeline_sessions ORDER BY id')
			.all()
			.map((row) => row.id);
		expect(remainingSessions).toEqual(['sess-other']);

		// Deleting the target session cascades to its step result; the other project's child stays.
		const remainingSteps = sqlite
			.query<{ id: string }, []>('SELECT id FROM pipeline_step_results ORDER BY id')
			.all()
			.map((row) => row.id);
		expect(remainingSteps).toEqual(['step-other']);

		const remainingInvocations = sqlite
			.query<{ id: string }, []>('SELECT id FROM invocation_events ORDER BY id')
			.all()
			.map((row) => row.id);
		expect(remainingInvocations).toEqual(['inv-other']);

		sqlite.close();
	});

	test('returns zero and removes nothing when no rows match the path', async () => {
		const sqlite = new Database(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON;');
		migrateWebDatabase(sqlite);
		const { db, commands } = wrapWebDatabase(sqlite);

		await db.insert(schema.runs).values({
			backend: 'native',
			id: 'run-keep',
			projectName: 'keep',
			projectPath: resolve('/projects/keep'),
			startedAt: Date.now(),
			status: 'failed',
		});

		const purged = await commands.purgeProjectRuns({
			projectPath: resolve('/projects/never-existed'),
		});
		expect(purged).toBe(0);
		const remaining = sqlite.query<{ id: string }, []>('SELECT id FROM runs').all();
		expect(remaining).toHaveLength(1);

		sqlite.close();
	});
});

describe('pipeline_step_results ordering constraints', () => {
	function insertPipelineSession(sqlite: Database, id: string): void {
		sqlite.run(
			`INSERT INTO pipeline_sessions (
				id, project_path, project_name, recipe_id, recipe_name, parameters_json,
				total_steps, started_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[id, '/test', 'test', 'recipe-1', 'Test Recipe', '{}', 2, Date.now()],
		);
	}

	function insertPipelineStep(
		sqlite: Database,
		input: {
			displayOrder: number;
			id: string;
			sequenceNumber: number;
			sessionId: string;
		},
	): void {
		sqlite.run(
			`INSERT INTO pipeline_step_results (
				id, session_id, sequence_number, display_order, depth,
				step_name, step_type, phase, status
			) VALUES (?, ?, ?, ?, 0, 'Step', 'shell', 'step', 'queued')`,
			[input.id, input.sessionId, input.sequenceNumber, input.displayOrder],
		);
	}

	test('rejects duplicate displayOrder values within one session', () => {
		const sqlite = new Database(':memory:');
		try {
			sqlite.exec('PRAGMA foreign_keys = ON;');
			migrateWebDatabase(sqlite);
			insertPipelineSession(sqlite, 'sess-display-order-unique');
			insertPipelineStep(sqlite, {
				displayOrder: 1,
				id: 'step-display-1',
				sequenceNumber: 1,
				sessionId: 'sess-display-order-unique',
			});

			expect(() =>
				insertPipelineStep(sqlite, {
					displayOrder: 1,
					id: 'step-display-duplicate',
					sequenceNumber: 2,
					sessionId: 'sess-display-order-unique',
				}),
			).toThrow(/UNIQUE constraint failed/);
		} finally {
			sqlite.close();
		}
	});

	test('allows repeated sequenceNumber values when displayOrder differs', () => {
		const sqlite = new Database(':memory:');
		try {
			sqlite.exec('PRAGMA foreign_keys = ON;');
			migrateWebDatabase(sqlite);
			insertPipelineSession(sqlite, 'sess-sequence-reused');
			insertPipelineStep(sqlite, {
				displayOrder: 1,
				id: 'step-sequence-1',
				sequenceNumber: 1,
				sessionId: 'sess-sequence-reused',
			});
			insertPipelineStep(sqlite, {
				displayOrder: 2,
				id: 'step-sequence-2',
				sequenceNumber: 1,
				sessionId: 'sess-sequence-reused',
			});

			const rows = sqlite
				.query<{ id: string }, []>(
					`SELECT id
					FROM pipeline_step_results
					WHERE session_id = 'sess-sequence-reused'
						AND sequence_number = 1
					ORDER BY display_order`,
				)
				.all()
				.map((row) => row.id);
			expect(rows).toEqual(['step-sequence-1', 'step-sequence-2']);
		} finally {
			sqlite.close();
		}
	});
});

describe('pipeline_step_results self-referential FK', () => {
	test('PRAGMA foreign_key_list includes self-referential parent constraint', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			const fks = sqlite
				.query<{ from: string; table: string; to: string; on_delete: string }, []>(
					'PRAGMA foreign_key_list(pipeline_step_results)',
				)
				.all();
			const selfFk = fks.find(
				(fk) =>
					fk.from === 'parent_step_result_id' &&
					fk.table === 'pipeline_step_results' &&
					fk.to === 'id',
			);
			expect(selfFk).toBeDefined();
			expect(selfFk!.on_delete).toBe('CASCADE');
		} finally {
			sqlite.close();
		}
	});

	test('deleting a parent step result cascades to children with foreign keys enabled', async () => {
		const sqlite = new Database(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON;');
		migrateWebDatabase(sqlite);
		const db = wrapWebDatabase(sqlite).db;

		const now = Date.now();
		await db.insert(schema.pipelineSessions).values({
			currentStepIndex: 0,
			id: 'sess-self-fk-1',
			parametersJson: '{}',
			projectName: 'test',
			projectPath: '/test',
			recipeId: 'recipe-1',
			recipeName: 'Test Recipe',
			startedAt: now,
			status: 'running',
			totalSteps: 2,
		});

		await db.insert(schema.pipelineStepResults).values({
			depth: 0,
			displayOrder: 0,
			id: 'parent-step-1',
			phase: 'step',
			sequenceNumber: 0,
			sessionId: 'sess-self-fk-1',
			startedAt: now,
			status: 'completed',
			stepName: 'Parent Step',
			stepType: 'aidd-cli',
		});

		await db.insert(schema.pipelineStepResults).values({
			depth: 1,
			displayOrder: 1,
			id: 'child-step-1',
			parentStepResultId: 'parent-step-1',
			phase: 'step',
			sequenceNumber: 1,
			sessionId: 'sess-self-fk-1',
			startedAt: now,
			status: 'queued',
			stepName: 'Child Step',
			stepType: 'aidd-cli',
		});

		// Verify child exists before delete
		const before = sqlite
			.query<{ id: string }, []>(
				"SELECT id FROM pipeline_step_results WHERE id = 'child-step-1'",
			)
			.all();
		expect(before).toHaveLength(1);

		// Delete the parent
		await db
			.delete(schema.pipelineStepResults)
			.where(eq(schema.pipelineStepResults.id, 'parent-step-1'));

		// Child should be gone via cascade
		const after = sqlite
			.query<{ id: string }, []>(
				"SELECT id FROM pipeline_step_results WHERE id = 'child-step-1'",
			)
			.all();
		expect(after).toHaveLength(0);

		sqlite.close();
	});
});

describe('suggestions cycleId FK', () => {
	test('suggestions accepts director priority task types', async () => {
		const sqlite = new Database(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON;');
		migrateWebDatabase(sqlite);
		const db = wrapWebDatabase(sqlite).db;

		const now = Date.now();
		await db.insert(schema.directorCycles).values({
			id: 'cycle-priority-types',
			startedAt: now,
			status: 'running',
			totalSuggestions: 1,
		});

		await db.insert(schema.suggestions).values({
			createdAt: now,
			cycleId: 'cycle-priority-types',
			description: 'Refresh artifacts',
			id: 'suggestion-priority-type',
			reasoning: 'Artifact priority gate is active',
			riskLevel: 'HIGH',
			status: 'pending',
			taskType: 'artifact_maintenance',
			title: 'Refresh aidd artifacts',
		});

		const row = sqlite
			.query<{ task_type: string }, []>(
				"SELECT task_type FROM suggestions WHERE id = 'suggestion-priority-type'",
			)
			.get();
		expect(row?.task_type).toBe('artifact_maintenance');
		sqlite.close();
	});

	test('PRAGMA foreign_key_list includes suggestions.cycle_id → director_cycles constraint', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			const fks = sqlite
				.query<{ from: string; table: string; to: string; on_delete: string }, []>(
					'PRAGMA foreign_key_list(suggestions)',
				)
				.all();
			const cycleFk = fks.find(
				(fk) => fk.from === 'cycle_id' && fk.table === 'director_cycles' && fk.to === 'id',
			);
			expect(cycleFk).toBeDefined();
			expect(cycleFk!.on_delete).toBe('CASCADE');
		} finally {
			sqlite.close();
		}
	});

	test('suggestions pipeline launch id references pipeline_sessions with SET NULL', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			const fks = sqlite
				.query<{ from: string; on_delete: string; table: string; to: string }, []>(
					'PRAGMA foreign_key_list(suggestions)',
				)
				.all();
			const pipelineFk = fks.find(
				(fk) =>
					fk.from === 'launched_pipeline_session_id' &&
					fk.table === 'pipeline_sessions' &&
					fk.to === 'id',
			);
			expect(pipelineFk).toBeDefined();
			expect(pipelineFk!.on_delete).toBe('SET NULL');
		} finally {
			sqlite.close();
		}
	});

	test('deleting a director cycle cascades to linked suggestions with foreign keys enabled', async () => {
		const sqlite = new Database(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON;');
		migrateWebDatabase(sqlite);
		const db = wrapWebDatabase(sqlite).db;

		const now = Date.now();
		await db.insert(schema.directorCycles).values({
			fleetHealthScore: 0.85,
			id: 'cycle-fk-1',
			startedAt: now,
			status: 'running',
			totalSuggestions: 1,
		});

		await db.insert(schema.suggestions).values({
			createdAt: now,
			cycleId: 'cycle-fk-1',
			description: 'Test suggestion',
			id: 'suggestion-fk-1',
			reasoning: 'Test reasoning',
			riskLevel: 'MEDIUM',
			status: 'pending',
			taskType: 'audit_remediation',
			title: 'Test Suggestion',
		});

		// Verify suggestion exists before delete
		const before = sqlite
			.query<{ id: string }, []>("SELECT id FROM suggestions WHERE id = 'suggestion-fk-1'")
			.all();
		expect(before).toHaveLength(1);

		// Delete the cycle
		await db.delete(schema.directorCycles).where(eq(schema.directorCycles.id, 'cycle-fk-1'));

		// Suggestion should be gone via cascade
		const after = sqlite
			.query<{ id: string }, []>("SELECT id FROM suggestions WHERE id = 'suggestion-fk-1'")
			.all();
		expect(after).toHaveLength(0);

		sqlite.close();
	});
});

describe('sync state from aidd metadata', () => {
	function webConfig(root: string) {
		return {
			allowRemote: false,
			allowedOrigins: [],
			allowedRoots: [root],
			dataDir: resolve(process.cwd(), 'data'),
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
	}

	test('no file-backed run metadata returns unknown state', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-sync-empty-'));
		const projectDir = join(tmpDir, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		const service = new ProjectService(webConfig(tmpDir));

		const detail = await service.getProjectDetail(encodeProjectId(projectDir));

		expect(detail.metadata.sync).toEqual({
			lastSyncAt: null,
			lastSyncError: null,
			preferredCli: null,
			preferredModel: null,
			preferredProvider: null,
			preferredReasoningEffort: null,
			syncState: 'unknown',
		});
	});

	test('completed runs.jsonl metadata drives idle state even when SQLite has newer rows', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-sync-runs-'));
		const projectDir = join(tmpDir, 'sample-project');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await Bun.write(
			join(projectDir, '.aidd', 'runs.jsonl'),
			`${JSON.stringify({
				backend: 'codex',
				endedAt: '2026-05-17T14:02:00.000Z',
				exitCode: 0,
				model: 'gpt-5',
				startedAt: '2026-05-17T14:00:00.000Z',
				stopReason: 'completed',
				summary: 'completed metadata-backed run',
			})}\n`,
		);

		const sqlite = new Database(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON;');
		migrateWebDatabase(sqlite);
		const db = wrapWebDatabase(sqlite).db;
		await db.insert(schema.runs).values({
			backend: 'native',
			id: 'run-sqlite-newer',
			model: 'sqlite-model',
			projectName: 'sample-project',
			projectPath: projectDir,
			startedAt: Date.parse('2026-05-18T14:00:00.000Z'),
			status: 'running',
		});
		const service = new ProjectService(webConfig(tmpDir));

		const detail = await service.getProjectDetail(encodeProjectId(projectDir));

		expect(detail.metadata.sync).toEqual({
			lastSyncAt: '2026-05-17T14:02:00.000Z',
			lastSyncError: null,
			preferredCli: 'codex',
			preferredModel: 'gpt-5',
			preferredProvider: null,
			preferredReasoningEffort: null,
			syncState: 'idle',
		});
		sqlite.close();
	});

	test('failed iteration metadata drives error state when no run summary exists', async () => {
		const tmpDir = canonicalProjectPath(await testTempDir('aidd-web-sync-iterations-'));
		const projectDir = join(tmpDir, 'sample-project');
		await mkdir(join(projectDir, '.aidd', 'iterations'), { recursive: true });
		await Bun.write(
			join(projectDir, '.aidd', 'iterations', '001.json'),
			JSON.stringify({
				backend: 'native',
				durationMs: 5000,
				endedAt: '2026-05-17T15:00:05.000Z',
				exitCode: 7,
				iteration: 1,
				outcome: { status: 'failed' },
				startedAt: '2026-05-17T15:00:00.000Z',
				summary: 'validation failed',
			}),
		);
		const service = new ProjectService(webConfig(tmpDir));

		const detail = await service.getProjectDetail(encodeProjectId(projectDir));

		expect(detail.metadata.sync).toEqual({
			lastSyncAt: '2026-05-17T15:00:05.000Z',
			lastSyncError: 'validation failed',
			preferredCli: 'native',
			preferredModel: null,
			preferredProvider: null,
			preferredReasoningEffort: null,
			syncState: 'error',
		});
	});
});
