import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { isPathAllowlisted } from '../pipeline/writeAllowlist.ts';
import { resolveRootDir } from '../runtime/rootDir.ts';
import { git, installHook } from './history-guard/install-hook.ts';

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
	| 'skipped'
	| 'write-allowlist';

export interface EnsureHistoryGuardOptions {
	/**
	 * Relative paths the current run is permitted to write, as passed to `--write-allowlist`.
	 * When set and `.githooks` is not among them, nothing is installed and the outcome is
	 * `'write-allowlist'`.
	 *
	 * This is the same gate `scaffoldProjectAssets` applies to every other file aidd puts in a
	 * project, and it exists for the same reason: a run under an allowlist is measured against
	 * that allowlist afterwards, so anything aidd writes outside it is charged to the agent. A
	 * metadata-only pipeline session (allowlist `.aidd`) installing five `.githooks/` files and
	 * staging them is how `project-intake` failed step 1 with "Metadata-only session wrote
	 * outside .aidd/: .githooks/…" — a violation the agent had no part in and no way to avoid.
	 */
	writeAllowlist?: string[];
}

/**
 * @param rootDir aidd's install root. Resolved from this module's own location by default, so
 *   callers that do not already track it (the web import path threads `config`, not `rootDir`)
 *   need not plumb a parameter through every layer to reach it. Overridable for tests.
 */
export async function ensureHistoryGuard(
	projectDir: string,
	rootDir: string = resolveRootDir(import.meta.url, 3),
	options: EnsureHistoryGuardOptions = {},
): Promise<GuardOutcome> {
	// Refuse before touching anything: this installer copies five files into `.githooks/` AND
	// stages them, so a half-run under an allowlist is worse than no run at all.
	if (
		options.writeAllowlist !== undefined &&
		!isPathAllowlisted('.githooks', options.writeAllowlist)
	) {
		return 'write-allowlist';
	}

	// Only guard a repository the project OWNS. Without this, a project nested inside an unrelated
	// repo (a monorepo subdir, or anything under a checked-out parent) would have its parent's hooks
	// rewritten from underneath it.
	// `--show-prefix` is projectDir's path relative to the repository root, and is empty exactly
	// when projectDir IS that root. Ask for it rather than comparing `--show-toplevel` against
	// projectDir: git answers with the resolved real path, so under an aliased path — a Windows
	// `subst` drive, a symlink, a junction — the two spellings never match and a repository the
	// project owns is refused as someone else's.
	const prefix = await git(projectDir, ['rev-parse', '--show-prefix']);
	if (!prefix.ok || prefix.stdout !== '') return 'not-a-repo';

	// The scaffold is the single source: it is what a fresh project is built from, whereas the
	// repo-root .githooks/ is aidd's own.
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
	// entire point of this guard is that a silent no-op is the worst outcome. 'kept' is unreachable
	// here — the push spec sets no `keepExisting` — and is folded into 'installed' rather than added
	// to GuardOutcome, so callers keep one vocabulary for "this project is guarded".
	if (push !== 'installed' && push !== 'kept') return push;

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
		keepExisting: true,
		marker: COMMIT_MARKER,
		sourceFile: COMMIT_SOURCE,
	});
	if (commit === 'foreign-hook') return 'foreign-commit-hook';
	if (commit === 'skipped') return 'skipped';
	return 'installed';
}
