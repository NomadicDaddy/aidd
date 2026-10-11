import type { Feature } from 'aidd-shared/metadata/features';
import type { MilestonePlan } from 'aidd-shared/metadata/roadmap-milestones';
import type { FileAiddStore } from 'aidd-shared/metadata/store';

function normalizeFeatureNotes(notes: unknown): string[] {
	if (typeof notes === 'string') return [notes];
	if (Array.isArray(notes)) {
		return notes.filter((note): note is string => typeof note === 'string');
	}
	return [];
}

// Re-read rather than writing back the snapshot taken at loadState: writeFeature persists the whole
// record, so a stale copy would silently revert any other field changed since. Only
// `shippedVersion` (and its note) is ours to set here. The field
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
		const notes = normalizeFeatureNotes(feature.notes);
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
