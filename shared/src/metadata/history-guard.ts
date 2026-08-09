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
/**
 * Every guard body the wrapper sources. The wrapper and the scripts it invokes are one unit: adding
 * a `bash "$hooks_dir/<guard>.sh"` line to scaffolding/.githooks/pre-push WITHOUT listing the guard
 * here ships a hook that immediately fails on a missing script in every derived project. A guard
 * absent from an older scaffolding tag is simply skipped (see the existence check below).
 *
 * Exported because there are two installers, not one: this covers the ingestion lanes, and
 * scripts/install-history-guard.ts sweeps the existing fleet. They must agree on the file set, and
 * a second literal is how they would stop agreeing — scripts/install-history-guard.ts already
 * shipped a hook calling a guard it did not deliver for that exact reason. scripts/ imports this;
 * shared/ never imports scripts/.
 */
export const GUARDS = ['aidd-history-guard.sh', 'screenshot-guard.sh'];
const MARKER = 'aidd history guard';

export const COMMIT_HOOK = 'pre-commit';
/**
 * The scaffolded commit hook is the leak-guard-only variant, deliberately not aidd's own
 * `pre-commit`. That one runs `bun run check:licenses` and `bun run smoke:qc:fast`, and a scaffolded
 * package.json defines only the second: a project born with it would fail every commit rather than
 * be guarded by one. `pre-commit-leak-guard-only` names no task at all, so it runs anywhere, and
 * scripts/sync-shared-core.ts reaches the same conclusion from that group's `requiresScripts` /
 * `fallbackSource` — it upgrades the hook in place once a project defines both names.
 *
 * Without this, a project is unguarded at commit time from creation until the next fleet-wide
 * sync, which is exactly the window in which a fresh project accumulates its first secrets.
 */
export const COMMIT_SOURCE = 'pre-commit-leak-guard-only';
/**
 * Every guard the guard-only hook sources. Deliberately shorter than the leak-guard contract's
 * `HOOK_FILES`: the fleet sync also carries `leak-guard-setup.sh`, which seeds the tier-2 pattern
 * file from a `prepare` script, and a scaffolded package.json has no `prepare` to run it. Copying it
 * here would deliver a file nothing invokes.
 */
export const COMMIT_GUARDS = ['leak-guard.sh'];
export const COMMIT_MARKER = 'bash .githooks/leak-guard.sh';

export type GuardOutcome =
	| 'foreign-commit-hook'
	| 'foreign-hook'
	| 'foreign-hooks-path'
	| 'installed'
	| 'no-source'
	| 'not-a-repo'
	| 'skipped';

interface HookSpec {
	/** Bodies the wrapper sources; each must be delivered with it or the hook fails on first run. */
	guards: string[];
	/** Name the hook takes in `.githooks/`, which is what `core.hooksPath` makes git run. */
	hook: string;
	/** Text that identifies the hook as ours, so a foreign one is refused rather than replaced. */
	marker: string;
	/** Name in `scaffolding/.githooks/`, which differs from `hook` for the commit guard. */
	sourceFile: string;
}

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
 * Copy one wrapper and the guards it sources into `.githooks`, then stage all of them.
 *
 * Shared by both hooks because the sequence is not obvious and getting half of it right is what
 * ships a broken repository: the wrapper and its guards are one unit, the index mode is the only
 * part that survives a clone, and a wrapper staged without its guards fails on a fresh checkout.
 */
async function installHook(
	projectDir: string,
	source: string,
	hooksDir: string,
	spec: HookSpec,
): Promise<'foreign-hook' | 'installed' | 'no-source' | 'skipped'> {
	const hookSource = join(source, spec.sourceFile);
	if (!(await Bun.file(hookSource).exists())) return 'no-source';

	// core.hooksPath allows exactly one hook of each name. Overwriting one we did not write would
	// silently disable whatever it was doing, so refuse and leave it to a human to chain.
	const hookPath = join(hooksDir, spec.hook);
	try {
		const existing = await readFile(hookPath, 'utf8');
		if (!existing.includes(spec.marker)) return 'foreign-hook';
	} catch {
		/* No hook yet — the normal case. */
	}

	try {
		await mkdir(hooksDir, { recursive: true });
		for (const guard of spec.guards) {
			const guardSource = join(source, guard);
			// A guard the current scaffolding does not ship is not an error: only guards the wrapper
			// actually sources are present, and copying a missing one would fail the whole install.
			if (await Bun.file(guardSource).exists()) {
				await copyFile(guardSource, join(hooksDir, guard));
			}
		}
		await copyFile(hookSource, hookPath);
	} catch {
		return 'skipped';
	}

	// The index mode is the only part that survives a clone: under core.fileMode=false (Windows) git
	// ignores the filesystem exec bit and records 100644, and POSIX git will not run a hook that is
	// not executable — yielding a repository that looks guarded and is not.
	const stagedHook = await git(projectDir, [
		'update-index',
		'--add',
		'--chmod=+x',
		`.githooks/${spec.hook}`,
	]);
	// Stage every guard body too. Staging only the wrapper lets a routine `git commit` publish a hook
	// that sources a file which is not in the repository — so a fresh clone runs a hook that
	// immediately fails on a missing script. The wrapper and the guards it sources are one unit.
	let stagedGuards = true;
	for (const guard of spec.guards) {
		// Only guards that were actually copied above exist to stage; skip the rest silently.
		if (!(await Bun.file(join(hooksDir, guard)).exists())) continue;
		const staged = await git(projectDir, ['add', `.githooks/${guard}`]);
		stagedGuards &&= staged.ok;
	}

	if (!stagedHook.ok || !stagedGuards) return 'skipped';
	return 'installed';
}

/**
 * @param rootDir aidd's install root. Resolved from this module's own location by default, so
 *   callers that do not already track it (the web import path threads `config`, not `rootDir`)
 *   need not plumb a parameter through every layer to reach it. Overridable for tests.
 */
export async function ensureHistoryGuard(
	projectDir: string,
	rootDir: string = resolveRootDir(import.meta.url, 3),
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

	const push = await installHook(projectDir, source, hooksDir, {
		guards: GUARDS,
		hook: HOOK,
		marker: MARKER,
		sourceFile: HOOK,
	});
	// Report what actually happened. Returning 'installed' unconditionally would let a read-only
	// checkout, a locked index, or a git too old for --chmod look identical to success — and the
	// entire point of this guard is that a silent no-op is the worst outcome.
	if (push !== 'installed') return push;

	const configured2 = await git(projectDir, ['config', 'core.hooksPath', '.githooks']);
	if (!configured2.ok) return 'skipped';

	// The commit-time guard is installed second and reported separately, because it is the weaker
	// of the two obligations: the push guard is what keeps `.aidd/` history off a remote, so a
	// project that gets one and not the other should get that one. A scaffolding tag predating the
	// leak guard has no source file here and simply yields the push-only install ('no-source' below
	// falls through to 'installed'), which is what every project got before this existed.
	const commit = await installHook(projectDir, source, hooksDir, {
		guards: COMMIT_GUARDS,
		hook: COMMIT_HOOK,
		marker: COMMIT_MARKER,
		sourceFile: COMMIT_SOURCE,
	});
	if (commit === 'foreign-hook') return 'foreign-commit-hook';
	if (commit === 'skipped') return 'skipped';
	return 'installed';
}
