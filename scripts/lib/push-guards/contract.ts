/**
 * What the push-time guard set consists of.
 *
 * The source of truth is aidd/.githooks, copied outward byte-identical, because a repository-local
 * divergence is exactly the failure mode the convention exists to prevent. This mirrors
 * lib/leak-guard/contract.ts, which does the same job for the commit-time hook.
 *
 * ONE HOOK, EVERY GUARD IT CHAINS. core.hooksPath allows exactly one pre-push, so the hook and the
 * guards it calls cannot have separate owners: two installers writing one file means whichever ran
 * last decides and the loser's guard is silently gone. That is why there is no
 * install-screenshot-guard.ts, and why adding a guard to the hook means adding it to GUARDS in the
 * same change.
 *
 * Unlike the commit-time hook there is no script-name contract here and so no second variant: every
 * guard below needs bash and git and nothing else, which is what lets this install everywhere
 * including repositories with no package.json.
 */
import { resolve } from 'node:path';

export const AIDD_ROOT = resolve(import.meta.dir, '..', '..', '..');

export const HOOK = 'pre-push';

/** Present in our hook and in no foreign one: what tells an existing hook apart from a stranger. */
export const MARKER = 'aidd history guard';

/**
 * Every guard .githooks/pre-push chains, in the order it chains them.
 *
 * Re-exported from the ingestion-lane installer rather than restated, because the two installers
 * cover different populations of the same fleet and a divergence between them is invisible until a
 * push fails. install-history-guard.test.ts additionally reads the hook body and fails when it
 * invokes a guard this list does not carry. That test exists because the omission already happened:
 * aidd/.githooks/pre-push grew a screenshot-guard.sh call on 2026-07-25 and this script's file list
 * was not updated, so for ten days it copied a hook that invoked a file it did not deliver. Under
 * `set -euo pipefail` that is not a degraded guard, it is a push that always fails.
 */
export { GUARDS } from '../../../shared/src/metadata/history-guard.ts';
