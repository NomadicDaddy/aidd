import { Database } from 'bun:sqlite';
import { mkdir, readFile, rm, utimes } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, test } from 'bun:test';
import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { encodeProjectId } from '../../backend/src/paths.ts';
import {
	runProjectCommand,
	spawnCommand,
} from '../../backend/src/services/appLauncher/launchProcess.ts';
import { AppLauncherService } from '../../backend/src/services/appLauncher/launcher.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';

import { testTempDir } from '../_helpers/temp.ts';
interface CapturedMessage {
	payload: unknown;
	type: string;
}

function createCapturingHub(): { hub: WebSocketHub; messages: CapturedMessage[] } {
	const hub = new WebSocketHub();
	const messages: CapturedMessage[] = [];
	hub.add({ send: (data: string) => messages.push(JSON.parse(data) as CapturedMessage) });
	return { hub, messages };
}

function appLaunchStatuses(messages: CapturedMessage[]): string[] {
	return messages
		.filter((message) => message.type === 'app_launch')
		.map((message) => (message.payload as { status?: unknown }).status)
		.filter((status): status is string => typeof status === 'string');
}

function webProjectConfig(root: string) {
	return {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [root],
		dataDir: resolve(root, 'data'),
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

function createDb() {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return { db: wrapWebDatabase(sqlite).db, sqlite };
}

function insertLaunchRow(
	sqlite: Database,
	input: {
		command?: string;
		pid?: number;
		projectDir: string;
		startedAt: number;
		status: 'crashed' | 'running' | 'stopped';
		stoppedAt: null | number;
		updatedAt?: number;
	},
): void {
	sqlite
		.query(
			[
				'INSERT INTO app_launches',
				'(project_path, status, pid, started_at, stopped_at, command, updated_at)',
				'VALUES (?, ?, ?, ?, ?, ?, ?)',
			].join(' '),
		)
		.run(
			input.projectDir,
			input.status,
			input.pid ?? null,
			input.startedAt,
			input.stoppedAt,
			input.command ?? 'bun run start',
			input.updatedAt ?? Date.now(),
		);
}

async function writeSpernakitProject(projectDir: string): Promise<void> {
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await Bun.write(
		join(projectDir, 'package.json'),
		JSON.stringify(
			{
				name: 'demo-spernakit-app',
				scripts: {
					start: 'bun start-script.ts',
					stop: 'bun stop-script.ts',
				},
				spernakit_version: '3.8.0',
			},
			null,
			'\t',
		),
	);
	await Bun.write(
		join(projectDir, 'start-script.ts'),
		[
			"import { mkdir, writeFile } from 'node:fs/promises';",
			"import { join } from 'node:path';",
			'const root = process.cwd();',
			"await mkdir(join(root, 'logs'), { recursive: true });",
			"await writeFile(join(root, 'logs', 'backend.pid'), String(process.pid), 'utf8');",
			"await writeFile(join(root, 'start-marker.txt'), 'started', 'utf8');",
		].join('\n'),
	);
	await Bun.write(
		join(projectDir, 'stop-script.ts'),
		[
			"import { rm, writeFile } from 'node:fs/promises';",
			"import { join } from 'node:path';",
			'const root = process.cwd();',
			"await writeFile(join(root, 'stop-marker.txt'), 'stopped', 'utf8');",
			"await rm(join(root, 'logs', 'backend.pid'), { force: true });",
		].join('\n'),
	);
}

async function writeGenericProject(projectDir: string, includeDevScript = true): Promise<void> {
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await Bun.write(
		join(projectDir, 'package.json'),
		JSON.stringify(
			{
				name: 'demo-generic-app',
				scripts: includeDevScript ? { dev: 'bun dev-script.ts' } : {},
			},
			null,
			'\t',
		),
	);
	await Bun.write(
		join(projectDir, 'dev-script.ts'),
		[
			"import { writeFile } from 'node:fs/promises';",
			"import { join } from 'node:path';",
			'const root = process.cwd();',
			"await writeFile(join(root, 'dev-marker.txt'), String(process.pid), 'utf8');",
		].join('\n'),
	);
}

async function waitForStatus(
	service: AppLauncherService,
	projectId: string,
	status: 'crashed' | 'running' | 'stopped',
) {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const launch = await service.getStatus(projectId);
		if (launch.status === status) return launch;
		await sleep(50);
	}
	return await service.getStatus(projectId);
}

async function waitForFile(path: string): Promise<string> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 20; attempt += 1) {
		try {
			return await readFile(path, 'utf8');
		} catch (error) {
			lastError = error;
			await sleep(50);
		}
	}
	throw lastError;
}

describe('app launcher service', () => {
	test('spawns long-lived app commands with hidden Windows process windows', () => {
		const originalSpawn = Bun.spawn;
		let capturedCommand: unknown;
		let capturedOptions: unknown;
		Bun.spawn = ((command: unknown, options?: unknown) => {
			capturedCommand = command;
			capturedOptions = options;
			return {
				exited: Promise.resolve(0),
				pid: 123,
				unref: () => undefined,
			} as unknown as ReturnType<typeof Bun.spawn>;
		}) as typeof Bun.spawn;
		try {
			spawnCommand(['bun', 'run', 'dev'], 'D:/applications/demo');
		} finally {
			Bun.spawn = originalSpawn;
		}

		expect(capturedCommand).toEqual(['bun', 'run', 'dev']);
		expect(capturedOptions).toMatchObject({
			cwd: 'D:/applications/demo',
			stderr: 'ignore',
			stdin: 'ignore',
			stdout: 'ignore',
			windowsHide: true,
		});
	});

	test('spawns short-lived app commands with hidden Windows process windows', async () => {
		const originalSpawn = Bun.spawn;
		let capturedCommand: unknown;
		let capturedOptions: unknown;
		Bun.spawn = ((command: unknown, options?: unknown) => {
			capturedCommand = command;
			capturedOptions = options;
			return {
				exited: Promise.resolve(0),
				pid: 123,
				signalCode: null,
				stderr: undefined,
				stdout: undefined,
			} as unknown as ReturnType<typeof Bun.spawn>;
		}) as typeof Bun.spawn;
		try {
			await runProjectCommand('D:/applications/demo', ['bun', 'run', 'start']);
		} finally {
			Bun.spawn = originalSpawn;
		}

		expect(capturedCommand).toEqual(['bun', 'run', 'start']);
		expect(capturedOptions).toMatchObject({
			cwd: 'D:/applications/demo',
			stdin: 'ignore',
			windowsHide: true,
		});
		expect(typeof (capturedOptions as { stderr?: unknown }).stderr).toBe('number');
		expect(typeof (capturedOptions as { stdout?: unknown }).stdout).toBe('number');
		expect((capturedOptions as { stderr?: unknown }).stderr).toBe(
			(capturedOptions as { stdout?: unknown }).stdout,
		);
	});

	test('captures short-lived command output without pipe streams', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		try {
			const result = await runProjectCommand(root, [
				process.execPath,
				'-e',
				"console.log('started'); console.error('warned');",
			]);

			expect(result.code).toBe(0);
			expect(result.output).toContain('started');
			expect(result.output).toContain('warned');
			expect(result.signal).toBeNull();
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('rejects generic projects without a dev script', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-generic-app');
		await writeGenericProject(projectDir, false);
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			let thrown: unknown;

			try {
				await service.start(projectId);
			} catch (error) {
				thrown = error;
			}

			expect(thrown).toBeInstanceOf(Error);
			expect((thrown as Error).message).toBe('Project is missing required dev script');
			expect(
				typeof thrown === 'object' && thrown !== null && 'status' in thrown
					? thrown.status
					: null,
			).toBe(400);
		} finally {
			sqlite.close();
		}
	});

	test('uses detached dev command for generic projects', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-generic-app');
		await writeGenericProject(projectDir);
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			const launch = await service.start(projectId);

			expect(launch.command).toBe('bun run dev');
			expect(launch.status).toBe('running');
			expect(typeof launch.pid).toBe('number');
			expect(Number(await waitForFile(join(projectDir, 'dev-marker.txt')))).toBeGreaterThan(
				0,
			);

			const stopped = await waitForStatus(service, projectId, 'stopped');

			expect(stopped.status).toBe('stopped');
		} finally {
			sqlite.close();
		}
	});

	test('broadcasts app_launch lifecycle events for WebSocket-driven invalidation', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-generic-app');
		await writeGenericProject(projectDir);
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const { hub, messages } = createCapturingHub();
		const service = new AppLauncherService({ db, hub, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			await service.start(projectId);

			expect(appLaunchStatuses(messages)).toContain('running');

			await waitForStatus(service, projectId, 'stopped');

			expect(appLaunchStatuses(messages)).toContain('stopped');
		} finally {
			sqlite.close();
		}
	});

	test('uses spernakit start and stop scripts for spernakit projects', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-spernakit-app');
		await writeSpernakitProject(projectDir);
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			const launch = await service.start(projectId);

			expect(launch.command).toBe('bun run start');
			expect(launch.status).toBe('running');
			expect(await readFile(join(projectDir, 'start-marker.txt'), 'utf8')).toBe('started');

			const stopped = await service.stop(projectId);

			expect(stopped.status).toBe('stopped');
			expect(await readFile(join(projectDir, 'stop-marker.txt'), 'utf8')).toBe('stopped');
		} finally {
			sqlite.close();
		}
	});

	test('reconciles an externally-stopped spernakit app to stopped, not crashed', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-spernakit-app');
		await writeSpernakitProject(projectDir);
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			await service.start(projectId);

			// Simulate an out-of-band `bun run stop` (e.g. a concurrent coding run): the
			// spernakit stop script removes the pid files, so no stale pid remains.
			await rm(join(projectDir, 'logs', 'backend.pid'), { force: true });

			const reconciled = await service.getStatus(projectId);

			expect(reconciled.status).toBe('stopped');
		} finally {
			sqlite.close();
		}
	});

	test('reconciles a crashed spernakit app (stale pid file) to crashed', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-spernakit-app');
		await writeSpernakitProject(projectDir);
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			await service.start(projectId);

			// The start script's process has exited but left logs/backend.pid behind — a
			// stale pid file is exactly how spernakit signals a silent crash.
			const reconciled = await service.getStatus(projectId);

			expect(reconciled.status).toBe('crashed');
		} finally {
			sqlite.close();
		}
	});

	test('promotes a stale stopped spernakit row when live pid files exist', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-spernakit-app');
		await writeSpernakitProject(projectDir);
		await mkdir(join(projectDir, 'logs'), { recursive: true });
		const pidPath = join(projectDir, 'logs', 'backend.pid');
		const stoppedAt = Date.now() - 10_000;
		const discoveredStartedAt = stoppedAt + 5_000;
		await Bun.write(pidPath, String(process.pid));
		await utimes(pidPath, new Date(discoveredStartedAt), new Date(discoveredStartedAt));
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			insertLaunchRow(sqlite, {
				pid: 41232,
				projectDir,
				startedAt: stoppedAt - 5_000,
				status: 'stopped',
				stoppedAt,
			});

			const reconciled = await service.getStatus(projectId);

			expect(reconciled.status).toBe('running');
			expect(reconciled.pid).toBe(process.pid);
			expect(reconciled.startedAt).toBe(discoveredStartedAt);
			expect(reconciled.stoppedAt).toBeNull();
		} finally {
			sqlite.close();
		}
	});

	test('does not promote stale stopped spernakit rows with only dead pid files', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-spernakit-app');
		await writeSpernakitProject(projectDir);
		await mkdir(join(projectDir, 'logs'), { recursive: true });
		const stoppedAt = Date.now() - 10_000;
		await Bun.write(join(projectDir, 'logs', 'backend.pid'), '2147483646');
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			insertLaunchRow(sqlite, {
				pid: 41232,
				projectDir,
				startedAt: stoppedAt - 5_000,
				status: 'stopped',
				stoppedAt,
			});

			const reconciled = await service.getStatus(projectId);

			expect(reconciled.status).toBe('stopped');
			expect(reconciled.stoppedAt).toBe(stoppedAt);
		} finally {
			sqlite.close();
		}
	});

	test('does not promote crashed spernakit rows from stale pid files with recycled pids', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-spernakit-app');
		await writeSpernakitProject(projectDir);
		await mkdir(join(projectDir, 'logs'), { recursive: true });
		const pidPath = join(projectDir, 'logs', 'backend.pid');
		const stoppedAt = Date.now() - 5_000;
		const stalePidMtime = stoppedAt - 5_000;
		await Bun.write(pidPath, String(process.pid));
		await utimes(pidPath, new Date(stalePidMtime), new Date(stalePidMtime));
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			insertLaunchRow(sqlite, {
				pid: 41232,
				projectDir,
				startedAt: stoppedAt - 10_000,
				status: 'crashed',
				stoppedAt,
			});

			const reconciled = await service.getStatus(projectId);

			expect(reconciled.status).toBe('crashed');
			expect(reconciled.stoppedAt).toBe(stoppedAt);
		} finally {
			sqlite.close();
		}
	});

	test('promotes crashed spernakit rows when pid files are fresher than the crash', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-spernakit-app');
		await writeSpernakitProject(projectDir);
		await mkdir(join(projectDir, 'logs'), { recursive: true });
		const pidPath = join(projectDir, 'logs', 'backend.pid');
		const stoppedAt = Date.now() - 10_000;
		const discoveredStartedAt = stoppedAt + 5_000;
		await Bun.write(pidPath, String(process.pid));
		await utimes(pidPath, new Date(discoveredStartedAt), new Date(discoveredStartedAt));
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			insertLaunchRow(sqlite, {
				pid: 41232,
				projectDir,
				startedAt: stoppedAt - 5_000,
				status: 'crashed',
				stoppedAt,
			});

			const reconciled = await service.getStatus(projectId);

			expect(reconciled.status).toBe('running');
			expect(reconciled.pid).toBe(process.pid);
			expect(reconciled.startedAt).toBe(discoveredStartedAt);
			expect(reconciled.stoppedAt).toBeNull();
		} finally {
			sqlite.close();
		}
	});

	test('discovers a no-row spernakit app when live pid files exist', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-spernakit-app');
		await writeSpernakitProject(projectDir);
		await mkdir(join(projectDir, 'logs'), { recursive: true });
		const pidPath = join(projectDir, 'logs', 'backend.pid');
		const discoveredStartedAt = Date.now() - 5_000;
		await Bun.write(pidPath, String(process.pid));
		await utimes(pidPath, new Date(discoveredStartedAt), new Date(discoveredStartedAt));
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);

			const launch = await service.getStatus(projectId);
			const stored = sqlite
				.query('SELECT status, pid, started_at FROM app_launches WHERE project_path = ?')
				.get(projectDir) as { pid: number; started_at: number; status: string };

			expect(launch.status).toBe('running');
			expect(launch.pid).toBe(process.pid);
			expect(launch.startedAt).toBe(discoveredStartedAt);
			expect(stored).toEqual({
				pid: process.pid,
				started_at: discoveredStartedAt,
				status: 'running',
			});
		} finally {
			sqlite.close();
		}
	});

	test('refuses to start a spernakit app already running outside stale launcher state', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const projectDir = join(root, 'demo-spernakit-app');
		await writeSpernakitProject(projectDir);
		await mkdir(join(projectDir, 'logs'), { recursive: true });
		const pidPath = join(projectDir, 'logs', 'backend.pid');
		const stoppedAt = Date.now() - 10_000;
		const discoveredStartedAt = stoppedAt + 5_000;
		await Bun.write(pidPath, String(process.pid));
		await utimes(pidPath, new Date(discoveredStartedAt), new Date(discoveredStartedAt));
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const projectId = encodeProjectId(projectDir);
			insertLaunchRow(sqlite, {
				pid: 41232,
				projectDir,
				startedAt: stoppedAt - 5_000,
				status: 'stopped',
				stoppedAt,
			});
			let thrown: unknown;

			try {
				await service.start(projectId);
			} catch (error) {
				thrown = error;
			}

			expect(thrown).toBeInstanceOf(Error);
			expect((thrown as Error).message).toBe(
				`App is already running for project (pid ${process.pid})`,
			);
			expect(
				typeof thrown === 'object' && thrown !== null && 'status' in thrown
					? thrown.status
					: null,
			).toBe(409);
		} finally {
			sqlite.close();
		}
	});

	test('boot reconciliation applies the same external-stop-vs-crash distinction', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const stoppedDir = join(root, 'demo-stopped-app');
		const crashedDir = join(root, 'demo-crashed-app');
		await writeSpernakitProject(stoppedDir);
		await writeSpernakitProject(crashedDir);
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			await service.start(encodeProjectId(stoppedDir));
			await service.start(encodeProjectId(crashedDir));

			// stopped app: pid files removed out-of-band; crashed app: stale pid retained.
			await rm(join(stoppedDir, 'logs', 'backend.pid'), { force: true });

			await service.reconcileOnBoot();

			const readStatus = (path: string) =>
				(
					sqlite
						.query('SELECT status FROM app_launches WHERE project_path = ?')
						.get(path) as { status: string }
				).status;

			expect(readStatus(stoppedDir)).toBe('stopped');
			expect(readStatus(crashedDir)).toBe('crashed');
		} finally {
			sqlite.close();
		}
	});

	test('getAllStatuses batches a status for every discovered project, not just launched rows', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const genericDir = join(root, 'demo-generic-app');
		const spernakitDir = join(root, 'demo-spernakit-app');
		const noScriptDir = join(root, 'demo-no-script-app');
		await writeGenericProject(genericDir);
		await writeSpernakitProject(spernakitDir);
		await writeGenericProject(noScriptDir, false);
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const statuses = await service.getAllStatuses();
			const byId = new Map(statuses.map((status) => [status.projectId, status]));

			// Every discovered project resolves a status even though NONE has a launch row —
			// this is what lets the projects list render from one batch instead of fanning
			// out to a per-project /status/:id request (the N+1 the trace surfaced).
			const generic = byId.get(encodeProjectId(genericDir));
			expect(generic?.status).toBe('stopped');
			expect(generic?.command).toBe('bun run dev');

			const spernakit = byId.get(encodeProjectId(spernakitDir));
			expect(spernakit?.status).toBe('stopped');
			expect(spernakit?.command).toBe('bun run start');

			// A project with no launchable script still appears, with an empty command so the
			// frontend can render the "unavailable" control rather than silently dropping it.
			const noScript = byId.get(encodeProjectId(noScriptDir));
			expect(noScript?.status).toBe('stopped');
			expect(noScript?.command).toBe('');

			// Exactly the three discovered projects, no duplicates.
			expect(statuses).toHaveLength(3);
			expect(byId.size).toBe(3);
		} finally {
			sqlite.close();
		}
	});

	test('getAllStatuses preserves a launch row whose project is no longer discovered', async () => {
		const root = await testTempDir('aidd-app-launcher-');
		const discoveredDir = join(root, 'demo-generic-app');
		await writeGenericProject(discoveredDir);
		// A project launched in the past but now outside any allowed root: discovery will not
		// find it, yet a still-tracked row must not vanish from the fleet view.
		const orphanRoot = await testTempDir('aidd-app-launcher-orphan-');
		const orphanDir = join(orphanRoot, 'demo-orphan-app');
		const projectService = new ProjectService(webProjectConfig(root));
		const { db, sqlite } = createDb();
		const service = new AppLauncherService({ db, projectService });
		try {
			const stoppedAt = Date.now() - 5_000;
			insertLaunchRow(sqlite, {
				projectDir: orphanDir,
				startedAt: stoppedAt - 5_000,
				status: 'stopped',
				stoppedAt,
			});

			const statuses = await service.getAllStatuses();
			const byId = new Map(statuses.map((status) => [status.projectId, status]));

			expect(byId.get(encodeProjectId(discoveredDir))?.status).toBe('stopped');
			expect(byId.get(encodeProjectId(orphanDir))?.status).toBe('stopped');
			expect(statuses).toHaveLength(2);
		} finally {
			sqlite.close();
			await rm(orphanRoot, { force: true, recursive: true });
		}
	});
});
