import type { Feature } from '../features.ts';

/**
 * Read a feature record, or `undefined` when its `feature.json` is no longer on disk.
 *
 * A run's own feature can be deleted out from under it mid-iteration: the worktree is shared, and
 * a concurrent run (a `consolidate-features` directive, an operator prune) can fold the selected
 * feature into another record and remove its directory while the agent is still working. Every
 * post-turn caller that reads the selected feature back — to honor a completion claim, to park it,
 * to stamp it — then threw ENOENT straight out of iteration finalization, which is strictly worse
 * than the vanished record itself: the iteration never closed, its artifact stayed `started`, and
 * the whole run's totals (tokens, cost, files, completions) were dropped on the floor. Observed on
 * run_1787610769365_f3b58391, whose committed, gate-passing work landed while the ledger recorded
 * a 69-minute run with zero of everything.
 *
 * Only a missing record is absorbed. A record that exists but will not parse is a different fault
 * with its own reporting path (`collectFeatureReadFailures` /
 * `FeatureScopeAudit.invalidFeatureMetadata`), so those errors still propagate to callers that
 * expect them.
 */
export async function readFeatureIfPresent(
	store: { readFeature: (id: string) => Promise<Feature> },
	id: string,
): Promise<Feature | undefined> {
	try {
		return await store.readFeature(id);
	} catch (error) {
		if (featureRecordMissing(error)) return undefined;
		throw error;
	}
}

/** ENOTDIR alongside ENOENT: removing `features/<id>/` can leave a parent segment resolving to a
 * file on some filesystems, and both mean the same thing here — there is no record to read. */
function featureRecordMissing(error: unknown): boolean {
	if (typeof error !== 'object' || error === null || !('code' in error)) return false;
	const code = (error as { code?: unknown }).code;
	return code === 'ENOENT' || code === 'ENOTDIR';
}
