import type { Feature } from 'aidd-shared/metadata/features';

import { isDismissableFinding } from 'aidd-shared/contracts/finding-dispositions';
import {
	assertFeatureRemovable,
	describeRecordedDismissal,
	dismissFinding,
	FindingDismissalRefusedError,
} from 'aidd-shared/metadata/finding-dismissal';
import { type FileAiddStore } from 'aidd-shared/metadata/store';
import { removeFeatureRecord } from 'aidd-shared/metadata/store/feature-removal';
import { join } from 'node:path';

import type { FindingDismissalInput } from './types.ts';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import { assertFeatureDirectory, type FeatureContext } from './features.ts';

async function readFeature(store: FileAiddStore, directory: string): Promise<Feature> {
	try {
		return await store.readFeature(directory);
	} catch {
		throw new HttpError(`Feature not found: ${directory}`, 404);
	}
}

function refusalToHttp(error: unknown): never {
	if (error instanceof FindingDismissalRefusedError) throw new HttpError(error.message, 409);
	throw error;
}

function traceRemoval(store: FileAiddStore, directory: string): void {
	recordDataMovement({
		category: 'file',
		operation: 'feature.delete',
		status: 'success',
		summary: { featureId: directory },
		target: join(store.metadataDir, 'features', directory),
	});
}

export async function deleteFeature(
	ctx: FeatureContext,
	projectId: string,
	featureDirectory: string,
): Promise<{ id: string }> {
	const store = await ctx.storeForProject(projectId);
	const directory = assertFeatureDirectory(featureDirectory);
	const feature = await readFeature(store, directory);
	try {
		assertFeatureRemovable(feature);
	} catch (err) {
		refusalToHttp(err);
	}
	// The same predicate the dismissal route accepts on, so no record is refused by both.
	if (isDismissableFinding(feature)) {
		throw new HttpError(
			'Fingerprinted audit findings must use POST /features/:featureId/dismissal',
			409,
		);
	}
	await removeFeatureRecord(store, directory);
	traceRemoval(store, directory);
	return { id: directory };
}

export async function dismissFeature(
	ctx: FeatureContext,
	projectId: string,
	featureDirectory: string,
	input: FindingDismissalInput,
): Promise<{ id: string }> {
	const store = await ctx.storeForProject(projectId);
	const directory = assertFeatureDirectory(featureDirectory);
	const feature = await readFeature(store, directory);
	let outcome;
	try {
		outcome = await dismissFinding(store, feature, directory, {
			...(input.note ? { note: input.note } : {}),
			reason: input.reason,
			source: 'web-ui',
		});
	} catch (err) {
		refusalToHttp(err);
	}
	if (outcome.removalError !== undefined) {
		const detail =
			outcome.removalError instanceof Error
				? outcome.removalError.message
				: String(outcome.removalError);
		// The decision is durable even though the directory is still there; a retry appends
		// nothing new (idempotent on the event tuple) and only repeats the removal.
		throw new HttpError(
			`Recorded ${describeRecordedDismissal(outcome.event)} but could not remove the feature directory: ${detail}. Retry the dismissal to complete the removal.`,
			500,
		);
	}
	traceRemoval(store, directory);
	return { id: directory };
}
