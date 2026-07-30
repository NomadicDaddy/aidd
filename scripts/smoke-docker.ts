#!/usr/bin/env bun
/**
 * End-to-end smoke test of the aidd Docker image (spernakit's smoke
 * docker-local methodology): build the image, compose-up with throwaway
 * volumes, then verify the container actually works — health, tokened API,
 * SPA, the /projects mount, a full run launch through the detached spawn
 * chain, and a graceful stop within the compose stop_grace_period.
 *
 * Usage:
 *   bun run smoke:docker [-- --no-build] [-- --with-claude] [-- --keep]
 *
 * Options:
 *   --no-build     Reuse the existing aidd:dev image
 *   --with-claude  Also launch a real claude-code run (requires
 *                  ANTHROPIC_API_KEY; spends real tokens). Guards against the
 *                  claude-as-root refusal regression.
 *   --keep         Leave the container and smoke directories up for debugging
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const projectRoot = resolve(import.meta.dirname, '..');
const smokeRoot = join(projectRoot, '.docker', 'smoke');
const SMOKE_TOKEN = 'aidd-smoke-token-0123456789abcdef0123456789abcdef';
const SMOKE_PORT = 3219;
const BASE_URL = `http://127.0.0.1:${SMOKE_PORT}`;
// First boot provisions all vendor CLIs into the disposable home volume before aidd starts.
// Cline's package is substantially larger than the other CLIs, so allow the complete pinned
// install sequence to finish on an uncached host.
const HEALTH_TIMEOUT_MS = 300_000;
const RUN_TERMINAL_TIMEOUT_MS = 240_000;
const STOP_GRACE_BUDGET_MS = 35_000;

const COMPOSE_FILES = ['-f', 'docker-compose.yml', '-f', 'docker-compose.test.yml'];

const { values } = parseArgs({
	options: {
		keep: { default: false, type: 'boolean' },
		'no-build': { default: false, type: 'boolean' },
		'with-claude': { default: false, type: 'boolean' },
	},
});

const smokeEnvFile = join(smokeRoot, 'compose.smoke.env');

/**
 * Compose interpolation variables travel via `--env-file` rather than child
 * env: docker compose needs the full parent environment (PATH, DOCKER_*)
 * inherited untouched, and check:env-spread forbids spreading process.env
 * into a child env.
 */
function writeSmokeEnvFile(): void {
	const path = (...parts: string[]): string => join(smokeRoot, ...parts).replaceAll('\\', '/');
	const vars = {
		AIDD_PORT: String(SMOKE_PORT),
		AIDD_SMOKE_ANTHROPIC_KEY: values['with-claude']
			? (process.env.ANTHROPIC_API_KEY ?? '')
			: '',
		AIDD_SMOKE_DATA: path('data'),
		AIDD_SMOKE_HOME: path('home'),
		AIDD_SMOKE_LOGS: path('logs'),
		AIDD_SMOKE_PROJECTS: path('projects'),
	};
	const lines = Object.entries(vars).map(([key, value]) => `${key}=${value}`);
	writeFileSync(smokeEnvFile, `${lines.join('\n')}\n`);
}

function compose(args: string[], stdio: 'inherit' | 'pipe' = 'inherit'): number {
	const result = spawnSync(
		'docker',
		['compose', '--env-file', smokeEnvFile, ...COMPOSE_FILES, ...args],
		{ cwd: projectRoot, stdio },
	);
	return result.status ?? 1;
}

function git(cwd: string, ...args: string[]): void {
	const result = spawnSync('git', args, { cwd, stdio: 'pipe', windowsHide: true });
	if (result.status !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${result.stderr?.toString() ?? ''}`);
	}
}

function seedSmokeDirs(): void {
	rmSync(smokeRoot, { force: true, recursive: true });
	for (const dir of ['data', 'logs', 'home/.aidd', 'projects/smoke-app']) {
		mkdirSync(join(smokeRoot, dir), { recursive: true });
	}
	const config = {
		web: {
			allowedOrigins: [],
			allowedRoots: ['/projects'],
			allowRemote: true,
			authToken: SMOKE_TOKEN,
			hostname: '0.0.0.0',
			port: 3210,
		},
	};
	writeFileSync(join(smokeRoot, 'home/.aidd/config.json'), JSON.stringify(config, null, '\t'), {
		mode: 0o600,
	});
	const app = join(smokeRoot, 'projects', 'smoke-app');
	writeFileSync(join(app, 'README.md'), '# smoke-app\n\nThrowaway repo for aidd docker smoke.\n');
	writeFileSync(
		join(app, 'package.json'),
		`${JSON.stringify({ name: 'smoke-app', private: true, version: '0.0.1' }, null, '\t')}\n`,
	);
	git(app, 'init');
	git(app, 'config', 'user.name', 'aidd-smoke');
	git(app, 'config', 'user.email', 'aidd-smoke@localhost');
	git(app, 'add', '.');
	git(app, 'commit', '-m', 'seed smoke-app');
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
	return fetch(`${BASE_URL}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${SMOKE_TOKEN}`,
			'Content-Type': 'application/json',
			...init.headers,
		},
	});
}

async function waitForHealth(): Promise<void> {
	const deadline = Date.now() + HEALTH_TIMEOUT_MS;
	let lastError = 'no attempt';
	while (Date.now() < deadline) {
		try {
			const response = await api('/api/v1/health');
			if (response.ok) return;
			lastError = `status ${response.status}`;
		} catch (err) {
			lastError = err instanceof Error ? err.message : String(err);
		}
		await Bun.sleep(1_000);
	}
	throw new Error(`health endpoint never came up within ${HEALTH_TIMEOUT_MS}ms: ${lastError}`);
}

interface RunRecord {
	backend?: string;
	errorMessage?: null | string;
	exitCode?: null | number;
	id: string;
	status: string;
	stopReason?: null | string;
}

async function launchRunAndAwaitTerminal(body: Record<string, unknown>): Promise<RunRecord> {
	const launch = await api('/api/v1/runs', { body: JSON.stringify(body), method: 'POST' });
	if (!launch.ok) {
		throw new Error(`run launch failed (${launch.status}): ${await launch.text()}`);
	}
	const { run } = (await launch.json()) as { run: RunRecord };
	console.log(`[smoke-docker] launched run ${run.id} (${String(body.backend)})`);
	const deadline = Date.now() + RUN_TERMINAL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const response = await api(`/api/v1/runs/${run.id}`);
		const { run: current } = (await response.json()) as { run: null | RunRecord };
		if (current && current.status !== 'running') return current;
		await Bun.sleep(2_000);
	}
	throw new Error(
		`run ${run.id} did not reach a terminal state within ${RUN_TERMINAL_TIMEOUT_MS}ms`,
	);
}

async function runOutputTail(id: string, lines: number): Promise<string> {
	const response = await api(`/api/v1/runs/${id}/output`);
	if (!response.ok) return '(no output available)';
	const text = await response.text();
	return text.split('\n').slice(-lines).join('\n');
}

async function smokeChecks(): Promise<void> {
	await waitForHealth();
	console.log('[smoke-docker] PASS health endpoint');

	const spa = await fetch(`${BASE_URL}/`);
	const html = await spa.text();
	if (!spa.ok || !html.toLowerCase().includes('<!doctype html>')) {
		throw new Error(`SPA root did not serve HTML (status ${spa.status})`);
	}
	console.log('[smoke-docker] PASS SPA served');

	const untokened = await fetch(`${BASE_URL}/api/v1/projects`);
	if (untokened.status !== 401) {
		throw new Error(`tokenless API request should be 401, got ${untokened.status}`);
	}
	console.log('[smoke-docker] PASS token required for API');

	const projects = await api('/api/v1/projects');
	if (!projects.ok) throw new Error(`projects list failed: ${projects.status}`);
	console.log('[smoke-docker] PASS tokened projects list');

	const candidates = await api('/api/v1/projects/import-candidates');
	const candidatesBody = await candidates.text();
	if (!candidates.ok || !candidatesBody.includes('smoke-app')) {
		throw new Error(`import candidates missing smoke-app (status ${candidates.status})`);
	}
	console.log('[smoke-docker] PASS /projects mount visible (smoke-app discovered)');

	const simulated = await launchRunAndAwaitTerminal({
		backend: 'native',
		maxIterations: 1,
		mode: 'coding',
		projectDir: '/projects/smoke-app',
		simulation: true,
	});
	// On a fresh project a 1-iteration run terminalizes as failed/max_iterations
	// with exit 0 — that is the healthy path here. A broken spawn chain shows up
	// as a non-zero exit code or an errorMessage instead.
	if (simulated.exitCode !== 0 || simulated.errorMessage) {
		const tail = await runOutputTail(simulated.id, 40);
		throw new Error(
			`simulation run unhealthy (status=${simulated.status} exit=${String(simulated.exitCode)} ` +
				`error=${String(simulated.errorMessage)}):\n${tail}`,
		);
	}
	console.log(
		`[smoke-docker] PASS simulation run executed (status=${simulated.status}, ` +
			`stopReason=${String(simulated.stopReason)}, exit=0)`,
	);

	if (values['with-claude']) {
		const real = await launchRunAndAwaitTerminal({
			backend: 'claude-code',
			maxIterations: 1,
			mode: 'coding',
			projectDir: '/projects/smoke-app',
		});
		const tail = await runOutputTail(real.id, 40);
		if (/root\/sudo|cannot be used with root/i.test(tail)) {
			throw new Error(`claude refused to run as root — non-root image regression:\n${tail}`);
		}
		console.log(`[smoke-docker] PASS claude run terminal state: ${real.status}`);
		console.log(`[smoke-docker] claude run output tail:\n${tail}`);
	}
}

async function main(): Promise<number> {
	if (values['with-claude'] && !process.env.ANTHROPIC_API_KEY) {
		console.error('[smoke-docker] --with-claude requires ANTHROPIC_API_KEY in the environment');
		return 2;
	}

	seedSmokeDirs();
	writeSmokeEnvFile();
	console.log(`[smoke-docker] seeded ${smokeRoot}`);

	if (!values['no-build']) {
		console.log('[smoke-docker] building image (docker compose build)');
		if (compose(['build']) !== 0) return 1;
	}

	// License compliance against the BUILT image: the notices and the relink offer are inside it,
	// the base-package inventory the offer points at matches, and no agent CLI got baked back in
	// (that would redistribute them — see 2.116.0). Static checks cannot see any of this.
	console.log('[smoke-docker] verifying image license material');
	const licenseCheck = Bun.spawnSync(
		['bun', 'scripts/check-image-licenses.ts', '--image', 'aidd:dev'],
		{ stderr: 'inherit', stdout: 'inherit' },
	);
	if (licenseCheck.exitCode !== 0) return 1;

	if (compose(['up', '-d']) !== 0) return 1;

	try {
		await smokeChecks();

		const stopStart = Date.now();
		if (compose(['stop']) !== 0) throw new Error('docker compose stop failed');
		const stopMs = Date.now() - stopStart;
		if (stopMs > STOP_GRACE_BUDGET_MS) {
			throw new Error(`graceful stop took ${stopMs}ms (> ${STOP_GRACE_BUDGET_MS}ms budget)`);
		}
		console.log(`[smoke-docker] PASS graceful stop in ${stopMs}ms`);
		console.log('[smoke-docker] all checks passed');
		return 0;
	} catch (err) {
		console.error(`[smoke-docker] FAIL: ${err instanceof Error ? err.message : String(err)}`);
		compose(['logs', '--tail', '50']);
		return 1;
	} finally {
		if (values.keep) {
			console.log(`[smoke-docker] --keep: container and ${smokeRoot} left in place`);
		} else {
			compose(['down', '--remove-orphans'], 'pipe');
			rmSync(smokeRoot, { force: true, recursive: true });
		}
	}
}

if (import.meta.main) {
	process.exit(await main());
}
