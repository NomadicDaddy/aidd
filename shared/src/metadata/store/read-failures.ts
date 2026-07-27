import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { Feature } from '../features.ts';

/** A feature directory whose `feature.json` exists but will not load. */
export interface FeatureReadFailure {
	directory: string;
	message: string;
}

// listFeatures drops any record it cannot read, which is exactly what a hand-edited feature.json
// looks like from the outside: the feature silently disappears from selection, stats, and the run's
// scope audit as if it had been deleted (observed: an agent amending a spec wrote a raw newline
// inside a JSON string, and the feature stayed invisible for a whole iteration). This reports those
// casualties so callers can say so out loud instead of inferring a deletion.
export async function collectFeatureReadFailures(
	metadataDir: string,
	readFeature: (directory: string) => Promise<Feature>,
): Promise<FeatureReadFailure[]> {
	const featuresDir = join(metadataDir, 'features');
	let entries: string[];
	try {
		entries = await readdir(featuresDir);
	} catch {
		return [];
	}
	const failures: FeatureReadFailure[] = [];
	for (const entry of entries) {
		try {
			await readFeature(entry);
			continue;
		} catch (error) {
			// A directory with no feature.json at all is scaffolding or a stray path, not a
			// corrupted record — only report entries whose record exists but will not load.
			const exists = await stat(join(featuresDir, entry, 'feature.json')).then(
				() => true,
				() => false,
			);
			if (!exists) continue;
			failures.push({
				directory: entry,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return failures.sort((left, right) => left.directory.localeCompare(right.directory));
}
