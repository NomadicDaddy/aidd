import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResolvedConfig } from 'aidd-shared/config';
import { parseArgs } from 'aidd-shared/args/index';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { type DoctorProber, runPreflightDoctor } from '../../cli/src/orchestrator/run/doctor.ts';

const rootDir = join(import.meta.dir, '..', '..');
const tmpRoot = join(rootDir, '.tmp-doctor-tests');

const config: ResolvedConfig = {
	cli: 'native',
	reasoningEffort: 'low',
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	timeoutSeconds: 3600,
	preflightDoctor: true,
	idleTimeoutSeconds: 1,
	idleNudgeTimeoutSeconds: 1,
	dirtyTreeThreshold: 50,
	noWorkBackoffMs: 0,
	noClean: false,
	quitOnAbort: 0,
	rateLimitBufferSeconds: 60,
	rateLimitBackoffSeconds: 300,
};

async function makeProjectDir(name: string): Promise<string> {
	const projectDir = join(tmpRoot, name);
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await writeFile(join(projectDir, '.aidd', 'project.md'), 'test\n');
	return projectDir;
}

function plan(projectDir: string, cli: 'claude-code' | 'cline' | 'codex' | 'native' = 'native') {
	return resolveRunPlan(parseArgs(['--project-dir', projectDir, '--cli', cli]), {
		...config,
		cli,
	});
}

afterEach(async () => {
	await rm(tmpRoot, { force: true, recursive: true });
});

describe('runPreflightDoctor', () => {
	test('passes when the backend CLI probe succeeds', async () => {
		const projectDir = await makeProjectDir('cli-ok');
		const probed: string[][] = [];
		const prober: DoctorProber = (cmd) => {
			probed.push(cmd);
			return Promise.resolve({ ok: true });
		};
		const result = await runPreflightDoctor(plan(projectDir, 'codex'), { prober });
		expect(result.ok).toBe(true);
		expect(probed).toEqual([['codex', '--version']]);
	});

	test('probes the Cline binary', async () => {
		const projectDir = await makeProjectDir('cline-ok');
		const probed: string[][] = [];
		const prober: DoctorProber = (cmd) => {
			probed.push(cmd);
			return Promise.resolve({ ok: true });
		};
		const result = await runPreflightDoctor(plan(projectDir, 'cline'), { prober });
		expect(result.ok).toBe(true);
		expect(probed).toEqual([['cline', '--version']]);
	});

	test('fails fast with an actionable summary when the backend CLI is missing', async () => {
		const projectDir = await makeProjectDir('cli-missing');
		const prober: DoctorProber = () =>
			Promise.resolve({ detail: 'ENOENT: command not found', ok: false });
		const result = await runPreflightDoctor(plan(projectDir, 'claude-code'), { prober });
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected failure');
		expect(result.summary).toContain("backend CLI 'claude'");
		expect(result.summary).toContain('ENOENT');
	});

	test('native backend probes the workspace toolchain through the resolved bash', async () => {
		const projectDir = await makeProjectDir('native-toolchain');
		const probed: string[][] = [];
		const prober: DoctorProber = (cmd) => {
			probed.push(cmd);
			return Promise.resolve({ ok: true });
		};
		const result = await runPreflightDoctor(plan(projectDir), { prober });
		expect(result.ok).toBe(true);
		expect(probed).toHaveLength(1);
		expect(probed[0]?.slice(1)).toEqual([
			'-c',
			'bun --version && command -v cat && command -v cp',
		]);
	});

	test('native toolchain failure names the bash and the consequence for gates', async () => {
		const projectDir = await makeProjectDir('native-broken');
		const prober: DoctorProber = () =>
			Promise.resolve({ detail: 'bun: Exec format error', ok: false });
		const result = await runPreflightDoctor(plan(projectDir), { prober });
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected failure');
		expect(result.summary).toContain('Exec format error');
		expect(result.summary).toContain("gates like 'bun run");
	});

	test('is skippable via config', async () => {
		const projectDir = await makeProjectDir('skip-config');
		const failingProber: DoctorProber = () => Promise.resolve({ detail: 'boom', ok: false });
		const runtimePlan = resolveRunPlan(parseArgs(['--project-dir', projectDir]), {
			...config,
			preflightDoctor: false,
		});
		const result = await runPreflightDoctor(runtimePlan, { prober: failingProber });
		expect(result.ok).toBe(true);
	});

	test('is skippable via AIDD_SKIP_DOCTOR=1', async () => {
		const projectDir = await makeProjectDir('skip-env');
		const failingProber: DoctorProber = () => Promise.resolve({ detail: 'boom', ok: false });
		process.env.AIDD_SKIP_DOCTOR = '1';
		try {
			const result = await runPreflightDoctor(plan(projectDir), { prober: failingProber });
			expect(result.ok).toBe(true);
		} finally {
			delete process.env.AIDD_SKIP_DOCTOR;
		}
	});
});
