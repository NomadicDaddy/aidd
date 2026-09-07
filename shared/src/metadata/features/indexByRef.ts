import type { Feature } from './types.ts';

/** Resolve dependency references by either id or directory, including derived projects. */
export function indexFeaturesByRef(allFeatures: Feature[]): Map<string, Feature> {
	const byRef = new Map<string, Feature>();
	for (const candidate of allFeatures) {
		byRef.set(candidate.id, candidate);
		if (candidate.directory) byRef.set(candidate.directory, candidate);
	}
	return byRef;
}
