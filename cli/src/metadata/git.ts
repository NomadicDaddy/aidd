import { ensureHistoryGuard } from 'aidd-shared/metadata/history-guard';

export type EnsureProjectGitRepoResult = 'initialized' | 'present' | 'skipped';

export interface GitCommandResult {
	exitCode: number;
	missing: boolean;
	ok: boolean;
	stderr: string;
	stdout: string;
}

// Injectable so the missing-git path is testable without depending on the host's git install.
export type GitRunner = (projectDir: string, args: string[]) => Promise<GitCommandResult>;

// Best-effort git init for a freshly scaffolded project: a missing or failing git must never abort
// the run, so this always resolves and only logs the outcome.
export async function initGitAfterScaffold(projectDir: string): Promise<void> {
	try {
		const status = await ensureProjectGitRepo(projectDir);
		if (status === 'skipped') {
			console.log(
				`[setup] Git not found on PATH; skipped repository initialization: ${projectDir}`
			);
		} else {
			console.log(
				`[setup] Git repository ${status === 'initialized' ? 'initialized' : 'already present'}: ${projectDir}`
			);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn(`[setup] Skipped git repository initialization (${message}): ${projectDir}`);
	}
}

export async function ensureProjectGitRepo(
	projectDir: string,
	run: GitRunner = gitOutput
): Promise<EnsureProjectGitRepoResult> {
	const topLevel = await run(projectDir, ['rev-parse', '--show-toplevel']);
	// Post-scaffold git init is a convenience, not a requirement: a clean machine may not have git
	// installed at all. Skip gracefully rather than crashing the run before it can start.
	if (topLevel.missing) return 'skipped';
	if (topLevel.ok) {
		const owned = topLevel.stdout.trim();
		if (owned && normalizeGitPath(owned) === normalizeGitPath(projectDir)) return 'present';
	}
	// Honor the user's Git init.defaultBranch configuration instead of forcing a branch name.
	await runGit(projectDir, ['init'], run);
	// The guard is installed wherever .aidd/ is ensured — but for a FRESH project that happens
	// before this point, when there is no repository yet to guard. This is the second seam: the
	// moment a fresh project's git actually exists. ensureHistoryGuard is idempotent, so a project
	// that was already guarded via ensureMetadata simply re-confirms.
	await ensureHistoryGuard(projectDir);
	return 'initialized';
}

function normalizeGitPath(value: string): string {
	const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function runGit(projectDir: string, args: string[], run: GitRunner): Promise<void> {
	const result = await run(projectDir, args);
	if (result.ok) return;
	const details = result.missing
		? 'git executable not found on PATH'
		: result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
	throw new Error(`git ${args.join(' ')} failed in ${projectDir}: ${details}`);
}

async function gitOutput(projectDir: string, args: string[]): Promise<GitCommandResult> {
	try {
		const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { exitCode, missing: false, ok: exitCode === 0, stderr, stdout };
	} catch {
		// git is not installed / not on PATH. Report it as a missing binary rather than throwing,
		// so callers can decide whether git is required or merely a convenience.
		return { exitCode: -1, missing: true, ok: false, stderr: '', stdout: '' };
	}
}
