import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { AiddStore } from '../store.ts';

function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'ENOENT'
	);
}

/**
 * Remove a feature record from disk and from the roadmap mapping. Shared by the web delete and
 * dismissal routes and the CLI dismiss command so every removal path drops the same two things.
 * A missing roadmap is not an error: projects without one have nothing to unmap.
 */
export async function removeFeatureRecord(
	store: { metadataDir: string } & Pick<AiddStore, 'readRoadmap' | 'writeRoadmap'>,
	directory: string,
): Promise<void> {
	await rm(join(store.metadataDir, 'features', directory), { recursive: true });
	try {
		const roadmap = await store.readRoadmap();
		if (roadmap.features[directory]) {
			const features = { ...roadmap.features };
			delete features[directory];
			await store.writeRoadmap({ ...roadmap, features });
		}
	} catch (error) {
		if (!isMissingFileError(error)) throw error;
	}
}
