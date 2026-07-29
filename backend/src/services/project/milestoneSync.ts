import type { Feature } from 'aidd-shared/metadata/features';
import type { MilestonePlan } from 'aidd-shared/metadata/roadmap-milestones';
import type { FileAiddStore } from 'aidd-shared/metadata/store';

// feature.json mirrors its milestone's priority (syncFeaturePriority in the store, and
// roadmap:apply). Milestone edits renumber those tiers, so the mirror is rewritten here — otherwise
// every feature keeps pointing at its old tier until the next unrelated write repairs it.
export async function syncFeaturePriorities(
	store: FileAiddStore,
	milestonePlan: MilestonePlan,
): Promise<void> {
	if (milestonePlan.priorityUpdates.length === 0) return;
	for (const update of milestonePlan.priorityUpdates) {
		// Re-read rather than writing back the snapshot taken at loadState: writeFeature persists the
		// whole record, so a stale copy would silently revert any other field changed since. Only
		// `priority` is ours to set here.
		let feature: Feature;
		try {
			feature = await store.readFeature(update.featureDirectory);
		} catch {
			continue;
		}
		await store.writeFeature({ ...feature, priority: update.to });
	}
}

// Same re-read discipline: only `shippedVersion` (and its note) is ours to set here. The field
// contract (docs/reference/feature-fields.md) says a shippedVersion stamp comes with a dated
// revision note — and a backfill is inferred provenance, not a recorded ship, so the note must say
// so or the stamp reads as fact.
export async function syncShippedVersions(
	store: FileAiddStore,
	milestonePlan: MilestonePlan,
): Promise<void> {
	const stampDate = new Date().toISOString().slice(0, 10);
	for (const backfill of milestonePlan.backfills) {
		let feature: Feature;
		try {
			feature = await store.readFeature(backfill.featureDirectory);
		} catch {
			continue;
		}
		if (feature.shippedVersion !== undefined) continue;
		const notes = Array.isArray(feature.notes) ? feature.notes : [];
		await store.writeFeature({
			...feature,
			notes: [
				...notes,
				`Revision ${backfill.shippedVersion} (${stampDate}): shippedVersion backfilled by milestone auto-place from the app's current version; the version this feature originally shipped in was not recorded.`,
			],
			shippedVersion: backfill.shippedVersion,
		});
	}
}
