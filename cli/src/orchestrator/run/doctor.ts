import type { BackendName } from 'aidd-shared/plan/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	augmentEnvPathForGitBash,
	resolveBashExecutable,
} from 'aidd-shared/agent/tools/bash-runtime';
import { runRepoDir } from 'aidd-shared/plan/types';
import { buildToolSubprocessEnv } from 'aidd-shared/subprocess-env';

export interface DoctorProbeResult {
	detail?: string;
	ok: boolean;
}

export type DoctorProber = (
	cmd: string[],
	cwd: string,
	timeoutMs: number,
	env?: Record<string, string>,
) => Promise<DoctorProbeResult>;

export interface PreflightDoctorDeps {
	prober?: DoctorProber | undefined;
}

const probeTimeoutMs = 3000;

const backendCliBinaries: Partial<Record<BackendName, string>> = {
	'claude-code': 'claude',
	cline: 'cline',
	codex: 'codex',
	grok: 'grok',
	kilocode: 'kilo',
	opencode: 'opencode',
};

async function spawnProbe(
	cmd: string[],
	cwd: string,
	timeoutMs: number,
	env?: Record<string, string>,
): Promise<DoctorProbeResult> {
	try {
		const proc = Bun.spawn(cmd, {
			cwd,
			...(env !== undefined ? { env } : {}),
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const timer = setTimeout(() => proc.kill(), timeoutMs);
		const exitCode = await proc.exited;
		clearTimeout(timer);
		if (exitCode === 0) return { ok: true };
		const stderr = (await new Response(proc.stderr).text()).trim();
		const stdout = (await new Response(proc.stdout).text()).trim();
		const firstLine = (stderr || stdout).split('\n')[0] ?? '';
		return { detail: `exit ${exitCode}${firstLine ? `: ${firstLine}` : ''}`, ok: false };
	} catch (err) {
		// Bun.spawn throws ENOENT for a missing binary instead of returning a non-zero exit.
		return { detail: err instanceof Error ? err.message : String(err), ok: false };
	}
}

/**
 * Fast environment sanity check before the first iteration: is the backend CLI runnable, and
 * (for the native family) can the resolved bash actually execute the workspace toolchain?
 * Catch a broken environment before the agent spends its run budget fighting toolchain errors.
 * The check should complete in a few seconds.
 * Skippable via config `preflightDoctor: false` or AIDD_SKIP_DOCTOR=1.
 */
export async function runPreflightDoctor(
	plan: RunPlan,
	deps: PreflightDoctorDeps = {},
): Promise<{ ok: false; summary: string } | { ok: true }> {
	if (plan.outputPolicy.preflightDoctor === false) return { ok: true };
	if (process.env.AIDD_SKIP_DOCTOR === '1') return { ok: true };
	if (plan.simulation) return { ok: true };
	const prober = deps.prober ?? spawnProbe;
	const cwd = runRepoDir(plan);

	const cliBinary = backendCliBinaries[plan.backend];
	if (cliBinary !== undefined) {
		const probe = await prober([cliBinary, '--version'], cwd, probeTimeoutMs);
		if (!probe.ok) {
			return {
				ok: false,
				summary: `preflight doctor: backend CLI '${cliBinary}' is not runnable (${probe.detail ?? 'unknown failure'}) — install or update it, or pick another backend`,
			};
		}
		return { ok: true };
	}

	// Native family: the agent's bash tool must exist and be able to run the workspace
	// toolchain. The probe runs through the resolved bash with the SAME env the shell tool
	// spawns with (Git-toolchain-augmented PATH): `bun --version` catches the WSL-bash trap
	// ("Exec format error") and a missing bun, and `command -v cat/cp` catches a bash whose
	// coreutils are unreachable even when bun.exe resolves through a stock Windows PATH.
	const bash = resolveBashExecutable();
	if ('error' in bash) {
		return { ok: false, summary: `preflight doctor: ${bash.error}` };
	}
	const probe = await prober(
		[bash.path, '-c', 'bun --version && command -v cat && command -v cp'],
		cwd,
		probeTimeoutMs,
		augmentEnvPathForGitBash(bash.path, buildToolSubprocessEnv()),
	);
	if (!probe.ok) {
		return {
			ok: false,
			summary: `preflight doctor: '${bash.path}' cannot run the workspace toolchain (bun/coreutils probe failed: ${probe.detail ?? 'unknown failure'}) — gates like 'bun run …' would never pass. Fix PATH/bash (set AIDD_BASH to Git Bash on Windows) before re-running.`,
		};
	}
	return { ok: true };
}
