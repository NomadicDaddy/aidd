import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveRootDir } from '../runtime/rootDir.ts';

/**
 * Installs the pre-push `.aidd` history guard into a project, if that project is a git repository.
 *
 * Called wherever aidd creates `.aidd/` — which is the ONE thing every ingestion lane has in common.
 * Hooking a git-init function instead covers only the lane that calls it: `Create Fresh` sets
 * `initGitAfterScaffold`, but `From Template` lets the template init its own git, `From GitHub`
 * runs degit's init, and `Ingest Existing` never inits anything because the repository already
 * exists. That last one is the dangerous case — it writes `.aidd/` into a repo that already has
 * whatever remote it was cloned from, which is precisely how a repository ends up with a published
 * `.aidd/` history nobody intended.
 *
 * Guarding on "has a `.aidd/`" rather than "was created a particular way" is what makes new lanes
 * safe by default: a future ingestion path gets the guard without its author knowing this exists.
 *
 * Best-effort throughout. A project without git, a read-only checkout, or a git too old for
 * `--chmod` must never fail the caller: an unguarded project is a smaller problem than an aidd run
 * that refuses to start.
 */

const HOOK = 'pre-push';
const GUARD = 'aidd-history-guard.sh';
const MARKER = 'aidd history guard';

export type GuardOutcome =
	'foreign-hook' | 'foreign-hooks-path' | 'installed' | 'no-source' | 'not-a-repo' | 'skipped';

const git = async (cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> => {
	try {
		const p = Bun.spawn(['git', '-C', cwd, ...args], {
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
		return { ok: code === 0, stdout: stdout.trim() };
	} catch {
		return { ok: false, stdout: '' };
	}
};

const normalize = (v: string): string => {
	const n = v.replace(/\\/g, '/').replace(/\/+$/, '');
	return process.platform === 'win32' ? n.toLowerCase() : n;
};

/**
 * @param rootDir aidd's install root. Resolved from this module's own location by default, so
 *   callers that do not already track it (the web import path threads `config`, not `rootDir`)
 *   need not plumb a parameter through every layer to reach it. Overridable for tests.
 */
export async function ensureHistoryGuard(
	projectDir: string,
	rootDir: string = resolveRootDir(import.meta.url, 3)
): Promise<GuardOutcome> {
	// Only guard a repository the project OWNS. Without this, a project nested inside an unrelated
	// repo (a monorepo subdir, or anything under a checked-out parent) would have its parent's hooks
	// rewritten from underneath it.
	const top = await git(projectDir, ['rev-parse', '--show-toplevel']);
	if (!top.ok || normalize(top.stdout) !== normalize(projectDir)) return 'not-a-repo';

	// The scaffold is the single source: it is what ships in the standalone build, whereas the
	// repo-root .githooks/ does not.
	const source = join(rootDir, 'scaffolding', '.githooks');
	const hookSource = join(source, HOOK);
	if (!(await Bun.file(hookSource).exists())) return 'no-source';

	// A repository may already run hooks from somewhere else. core.hooksPath is a single value, so
	// pointing it at .githooks silently disables whatever it named before — Husky (.husky) being the
	// common case, and `Ingest Existing` pointing this at arbitrary third-party repositories being
	// the common opportunity. Never redirect a hooks path we did not set.
	const configured = await git(projectDir, ['config', '--local', 'core.hooksPath']);
	if (configured.ok && configured.stdout !== '' && configured.stdout !== '.githooks') {
		return 'foreign-hooks-path';
	}

	// With core.hooksPath unset, git runs .git/hooks. Redirecting to .githooks would disable any
	// real hook living there. Git ships *.sample files that are inert by design — those do not count.
	if (!configured.ok || configured.stdout === '') {
		const gitDir = await git(projectDir, ['rev-parse', '--git-path', 'hooks']);
		if (gitDir.ok) {
			const legacy = join(projectDir, gitDir.stdout);
			try {
				const entries = await readdir(legacy);
				if (entries.some((e) => !e.endsWith('.sample'))) return 'foreign-hooks-path';
			} catch {
				/* No .git/hooks directory — nothing to preserve. */
			}
		}
	}

	const hooksDir = join(projectDir, '.githooks');
	const hookPath = join(hooksDir, HOOK);

	// core.hooksPath allows exactly one pre-push. Overwriting a hook we did not write would silently
	// disable whatever it was doing, so refuse and leave it to a human to chain.
	try {
		const existing = await readFile(hookPath, 'utf8');
		if (!existing.includes(MARKER)) return 'foreign-hook';
	} catch {
		/* No hook yet — the normal case. */
	}

	try {
		await mkdir(hooksDir, { recursive: true });
		await copyFile(join(source, GUARD), join(hooksDir, GUARD));
		await copyFile(hookSource, hookPath);
	} catch {
		return 'skipped';
	}

	const configured2 = await git(projectDir, ['config', 'core.hooksPath', '.githooks']);
	// The index mode is the only part that survives a clone: under core.fileMode=false (Windows) git
	// ignores the filesystem exec bit and records 100644, and POSIX git will not run a hook that is
	// not executable — yielding a repository that looks guarded and is not.
	const stagedHook = await git(projectDir, [
		'update-index',
		'--add',
		'--chmod=+x',
		`.githooks/${HOOK}`,
	]);
	// Stage the guard body too. Staging only the wrapper lets a routine `git commit` publish a hook
	// that sources a file which is not in the repository — so a fresh clone runs a pre-push that
	// immediately fails on a missing script. The two files are one unit.
	const stagedGuard = await git(projectDir, ['add', `.githooks/${GUARD}`]);

	// Report what actually happened. Returning 'installed' unconditionally would let a read-only
	// checkout, a locked index, or a git too old for --chmod look identical to success — and the
	// entire point of this guard is that a silent no-op is the worst outcome.
	if (!configured2.ok || !stagedHook.ok || !stagedGuard.ok) return 'skipped';
	return 'installed';
}
