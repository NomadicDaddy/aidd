/**
 * The names of the commit-time leak guard that this repository's own checks need.
 *
 * `.githooks/` holds two variants of the commit hook, because unlike the history guard this hook is
 * not self-contained. The history guard needs bash and git and nothing else. The full pre-commit
 * additionally calls `bun run smoke:qc:fast` and `bun run check:licenses` — a script-name contract,
 * satisfiable however the carrier likes, but only if the carrier defines the names at all. A hook
 * that calls a script the repository does not define fails EVERY commit rather than guarding it,
 * and a hook that fails every commit gets uninstalled, not fixed. So:
 *
 *   full        package.json defines both names -> .githooks/pre-commit
 *   guard-only  it does not                     -> .githooks/pre-commit-leak-guard-only, installed
 *                                                  as pre-commit; same guard, no static checks
 *
 * Everything the fleet sync decides is stated in `scripts/shared-core-manifest.json` and nowhere
 * here: the two script names (`requiresScripts`), the file lists, the markers and the package.json
 * wiring. A second copy of any of them could disagree with the one that actually decides, and the
 * disagreement would be invisible.
 *
 * The hook name, the guard-only variant's filename and the files that variant sources are
 * re-exported from the ingestion-lane installer rather than restated, for the same reason
 * push-guards/contract.ts re-exports GUARDS: `ensureHistoryGuard` writes the one file
 * core.hooksPath allows, and check:hook-parity must judge exactly the set it installs. shared/
 * never imports scripts/, so the shared module owns the names and this one follows.
 */
export {
	/**
	 * What the guard-only variant sources. It leaves out `leak-guard-setup.sh`, which the full
	 * variant's carriers also hold: the setup script is invoked from a `prepare` key, and the
	 * population that gets the guard-only hook is the population with no such key. See the shared
	 * module for the full reasoning.
	 */
	COMMIT_GUARDS as GUARD_ONLY_FILES,
	COMMIT_SOURCE as GUARD_ONLY_SOURCE,
	COMMIT_HOOK as HOOK,
} from '../../../shared/src/metadata/history-guard.ts';
