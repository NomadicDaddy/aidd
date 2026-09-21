import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import { Database } from 'bun:sqlite';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { wrapWebDatabase } from '../../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../../backend/src/db/migrate.ts';
import { ProjectService } from '../../../backend/src/services/projectService.ts';
import { RunService } from '../../../backend/src/services/runService.ts';
import { TelemetryService } from '../../../backend/src/services/telemetryService.ts';
import { WebSocketHub } from '../../../backend/src/webSocketHub.ts';
import { testTempDir } from '../../_helpers/temp.ts';
import { writeFakeCliEntrypoint } from './heartbeat-stub.ts';

// Shared RunService harness for the admission-queue suites: an in-memory migrated database, a fake
// CLI entrypoint, and a spawn witness directory that counts which runs actually started a child.
export function wait(ms: number): Promise<void> {
	return Bun.sleep(ms);
}

export function spawnWitness(dir: string): string {
	const target = JSON.stringify(dir);
	return `
{
	const { mkdir, writeFile } = await import('node:fs/promises');
	const { join } = await import('node:path');
	await mkdir(${target}, { recursive: true });
	await writeFile(join(${target}, (process.env.AIDD_EXT_RUN_ID || 'unknown') + '.txt'), 'spawned');
}
`;
}

export async function spawnWitnessCount(dir: string): Promise<number> {
	try {
		return (await readdir(dir)).length;
	} catch {
		return 0;
	}
}

export async function waitForWitnessCount(dir: string, expected: number): Promise<void> {
	const startedAt = Date.now();
	for (;;) {
		if ((await spawnWitnessCount(dir)) >= expected) return;
		if (Date.now() - startedAt > 5000) {
			throw new Error(`Timed out waiting for ${expected} spawned children`);
		}
		await wait(25);
	}
}

export async function makeProject(root: string): Promise<string> {
	const projectDir = join(root, 'sample-project');
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await Bun.write(join(projectDir, '.aidd', 'spec.md'), '# Sample\n');
	return projectDir;
}

export async function makeLauncherRoot(script: string): Promise<string> {
	const root = await testTempDir('aidd-admit-root-');
	await writeFakeCliEntrypoint(root, script);
	await Bun.write(join(root, 'VERSION'), 'test-version\n');
	return root;
}

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

export function makeService(input: {
	allowedRoot: string;
	dataDir: string;
	rootDir: string;
	web?: Partial<ResolvedWebConfig>;
}): { db: ReturnType<typeof wrapWebDatabase>['db']; service: RunService; sqlite: Database } {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
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
		...input.web,
	};
	const { db, commands } = wrapWebDatabase(sqlite);
	return {
		db,
		service: new RunService(
			makeConfig(web),
			db,
			commands,
			new WebSocketHub(),
			new ProjectService(web),
			input.rootDir,
			new TelemetryService({ commands, db }),
		),
		sqlite,
	};
}
