/**
 * What the commit-time leak guard consists of, and which parts of it are synced.
 *
 * The source of truth is aidd/.githooks, copied outward byte-identical, because a
 * repository-local divergence is exactly the failure mode the convention exists to prevent.
 *
 * TWO HOOK VARIANTS, because unlike the history guard this hook is not self-contained. The history
 * guard needs bash and git and nothing else. The full pre-commit additionally calls `bun run
 * smoke:qc:fast` and `bun run check:licenses` — a script-name contract, satisfiable however the
 * carrier likes, but only if the carrier defines the names at all. A hook that calls a script the
 * repository does not define fails EVERY commit rather than guarding it, and a hook that fails
 * every commit gets uninstalled, not fixed. So:
 *
 *   full        package.json defines both names -> .githooks/pre-commit, byte-identical to aidd's
 *   guard-only  it does not                     -> .githooks/pre-commit-leak-guard-only, installed
 *                                                  as pre-commit; same guard, no static checks
 *
 * The two names themselves are no longer stated here. Choosing the variant belongs to the sync,
 * which reads them from the `leak-guard-hooks` group's `requiresScripts` in
 * `scripts/shared-core-manifest.json`; a second copy of that list here could disagree with the one
 * that actually decides, and the disagreement would be invisible.
 */
import { resolve } from 'node:path';

export const AIDD_ROOT = resolve(import.meta.dir, '..', '..', '..');

export const HOOK = 'pre-commit';
export const GUARD_ONLY_SOURCE = 'pre-commit-leak-guard-only';

/** Present in both hook variants and in no foreign hook: the line that invokes the guard. */
export const MARKER = 'bash .githooks/leak-guard.sh';

/**
 * Opt-out a repository writes into its own hook to say "this chain is deliberate, sync around it".
 * Deliberate, not inferred: see classifyHook for why content cannot decide it.
 */
export const LOCAL_CHAIN = '# leak-guard: local chain, kept by hand';

export const HOOK_FILES = ['leak-guard.sh', 'leak-guard-setup.sh'];

/** Copied only where a package.json exists — there is nothing to invoke them from otherwise. */
export const SCRIPT_FILES = ['check-leak-guard.sh'];

/**
 * Seeded when absent, never overwritten. run-bash.ts is repository-LOCAL by design and says so in
 * its own header: the byte-identical shell scripts cannot carry a Windows portability fix, so it
 * lives in the script that invokes them and describes that repository's own entry points. aidd's
 * copy names `bun install` and smoke:qc; starsync's names prepublishOnly. Syncing it would rewrite
 * each carrier's explanation with another's.
 */
export const SEEDED_SCRIPTS = ['run-bash.ts'];

/**
 * The package.json keys a carrier needs beyond the hook itself, reported and never written:
 * editing a target manifest from here would reformat it to this repository's conventions rather
 * than its own. `prepare` makes the guard survive a fresh clone by seeding the tier-2 pattern
 * file; `check:leak-guard` puts the guard's own self-test on the repository's gate.
 */
export const WIRING: Record<string, string> = {
	'check:leak-guard': 'bun ./scripts/run-bash.ts scripts/check-leak-guard.sh',
	prepare:
		'(git config core.hooksPath .githooks && bun ./scripts/run-bash.ts .githooks/leak-guard-setup.sh) || true',
};
