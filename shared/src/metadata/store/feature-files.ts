import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ZodError } from 'zod/v4';

import { type Feature, featureSchema } from '../features.ts';
import { serializeFeatureFile } from './serialize.ts';

export function featureFilePath(metadataDir: string, id: string): string {
	return join(metadataDir, 'features', id, 'feature.json');
}

export async function readFeatureFile(metadataDir: string, id: string): Promise<Feature> {
	const raw = await readFile(featureFilePath(metadataDir, id), 'utf8');
	const feature = featureSchema.parse(JSON.parse(raw));
	feature.directory = id;
	return feature;
}

export async function persistFeatureFile(metadataDir: string, feature: Feature): Promise<void> {
	// Write back to the directory the feature was read from. `featureNodeId` treats
	// `directory ?? id` as the on-disk name everywhere else; keying this off `id` alone would
	// fork a second directory for every derived feature whose id and directory disagree.
	const id = feature.directory ?? feature.id;
	const filePath = featureFilePath(metadataDir, id);
	// Read before write so the record keeps the formatting it already had — see serializeFeatureFile.
	const existing = await readFile(filePath, 'utf8').catch(() => '');
	await mkdir(join(metadataDir, 'features', id), { recursive: true });
	await writeFile(filePath, serializeFeatureFile(feature, existing));
}

/** The prior record when one exists and parses; missing or malformed metadata reads as none. */
export async function readExistingFeature(
	metadataDir: string,
	id: string,
): Promise<Feature | undefined> {
	try {
		return await readFeatureFile(metadataDir, id);
	} catch (error) {
		// Malformed prior metadata is repairable but cannot prove a lifecycle transition.
		if (error instanceof SyntaxError || error instanceof ZodError) return undefined;
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { code?: unknown }).code === 'ENOENT'
		) {
			return undefined;
		}
		throw error;
	}
}
