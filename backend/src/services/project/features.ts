import type { Roadmap } from 'aidd-shared/metadata/roadmap';

import { type Feature, isValidFeatureStatus } from 'aidd-shared/metadata/features';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProjectFeatureDto } from '../../types.ts';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import {
	type FeatureApprovalInput,
	PROJECT_FEATURE_STATUSES,
	type ProjectFeatureStatus,
} from './types.ts';

export interface FeatureContext {
	resolveDiscoveredProject(projectId: string): Promise<string>;
	storeForProject(projectId: string): Promise<FileAiddStore>;
}

export function assertFeatureDirectory(featureDirectory: string): string {
	if (
		featureDirectory.length === 0 ||
		featureDirectory === '.' ||
		featureDirectory === '..' ||
		featureDirectory.includes('/') ||
		featureDirectory.includes('\\')
	) {
		throw new HttpError('Invalid feature id', 400);
	}
	return featureDirectory;
}

function assertProjectFeatureStatus(status: string): ProjectFeatureStatus {
	if (!PROJECT_FEATURE_STATUSES.has(status as ProjectFeatureStatus)) {
		throw new HttpError(`Invalid feature status: ${status}`, 400);
	}
	return status as ProjectFeatureStatus;
}

function updatePassStateForStatus(feature: Feature, status: ProjectFeatureStatus): Feature {
	if (status === 'completed') return { ...feature, passes: true, status };
	if (status === 'backlog' || status === 'in_progress' || status === 'waiting_approval') {
		return { ...feature, passes: false, status };
	}
	return { ...feature, status };
}

function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'ENOENT'
	);
}

function assertRoadmapMilestone(roadmap: Roadmap, milestone: string): string {
	if (!Object.prototype.hasOwnProperty.call(roadmap.milestones, milestone)) {
		throw new HttpError(`Unknown roadmap milestone: ${milestone}`, 400);
	}
	return milestone;
}

async function readFeatureForMutation(
	store: FileAiddStore,
	featureDirectory: string,
): Promise<Feature> {
	try {
		return await store.readFeature(featureDirectory);
	} catch {
		throw new HttpError(`Feature not found: ${featureDirectory}`, 404);
	}
}

export async function approveFeature(
	ctx: FeatureContext,
	projectId: string,
	featureDirectory: string,
	input: FeatureApprovalInput,
): Promise<Feature> {
	const store = await ctx.storeForProject(projectId);
	const directory = assertFeatureDirectory(featureDirectory);
	const feature = await readFeatureForMutation(store, directory);
	if (feature.status !== 'waiting_approval') {
		throw new HttpError('Only waiting_approval features can be approved', 409);
	}
	if (input.decisionRequired && !input.decision?.trim()) {
		throw new HttpError('Approval decision is required', 400);
	}
	const approvedFeature: Feature = {
		...feature,
		approval: {
			approvedAt: new Date().toISOString(),
			decision: input.decisionRequired ? input.decision : null,
			decisionRequired: input.decisionRequired,
			source: 'web-ui',
		},
		passes: false,
		status: 'backlog',
	};
	await store.writeFeature(approvedFeature);
	recordDataMovement({
		category: 'metadata',
		operation: 'feature.approve',
		status: 'success',
		summary: { decisionRequired: input.decisionRequired, featureId: directory },
		target: join(store.metadataDir, 'features', directory, 'feature.json'),
	});
	return approvedFeature;
}

export async function deleteFeature(
	ctx: FeatureContext,
	projectId: string,
	featureDirectory: string,
): Promise<{ id: string }> {
	const projectDir = await ctx.resolveDiscoveredProject(projectId);
	const store = new FileAiddStore(projectDir);
	const directory = assertFeatureDirectory(featureDirectory);
	const feature = await readFeatureForMutation(store, directory);
	if (feature.status !== 'backlog' && feature.status !== 'waiting_approval') {
		throw new HttpError('Only backlog or waiting_approval features can be deleted', 409);
	}
	await rm(join(store.metadataDir, 'features', directory), { recursive: true });
	try {
		const roadmap = await store.readRoadmap();
		if (roadmap.features[directory]) {
			const features = { ...roadmap.features };
			delete features[directory];
			await store.writeRoadmap({ ...roadmap, features });
		}
	} catch (err) {
		if (!isMissingFileError(err)) throw err;
	}
	recordDataMovement({
		category: 'file',
		operation: 'feature.delete',
		status: 'success',
		summary: { featureId: directory },
		target: join(store.metadataDir, 'features', directory),
	});
	return { id: directory };
}

export async function updateFeatureStatus(
	ctx: FeatureContext,
	projectId: string,
	featureDirectory: string,
	statusInput: string,
): Promise<Feature> {
	const store = await ctx.storeForProject(projectId);
	const directory = assertFeatureDirectory(featureDirectory);
	const feature = await readFeatureForMutation(store, directory);
	const hasInvalidPersistedStatus =
		typeof feature.status === 'string' && !isValidFeatureStatus(feature.status);
	if (feature.status !== 'backlog' && !hasInvalidPersistedStatus) {
		throw new HttpError('Only backlog or invalid-status features can be updated inline', 409);
	}
	const status = assertProjectFeatureStatus(statusInput);
	const updatedFeature = updatePassStateForStatus(feature, status);
	await store.writeFeature(updatedFeature);
	recordDataMovement({
		category: 'metadata',
		operation: 'feature.status',
		status: 'success',
		summary: { featureId: directory, nextStatus: status },
		target: join(store.metadataDir, 'features', directory, 'feature.json'),
	});
	return updatedFeature;
}

export interface FeatureMetadataInput {
	notes?: string[];
	spec?: string;
}

export async function updateFeatureMetadata(
	ctx: FeatureContext,
	projectId: string,
	featureDirectory: string,
	input: FeatureMetadataInput,
): Promise<Feature> {
	const store = await ctx.storeForProject(projectId);
	const directory = assertFeatureDirectory(featureDirectory);
	const feature = await readFeatureForMutation(store, directory);
	const updatedFeature: Feature = {
		...feature,
		...(input.spec !== undefined ? { spec: input.spec } : {}),
		...(input.notes !== undefined ? { notes: input.notes } : {}),
	};
	await store.writeFeature(updatedFeature);
	recordDataMovement({
		category: 'metadata',
		operation: 'feature.metadata',
		status: 'success',
		summary: {
			featureId: directory,
			fields: (Object.keys(input) as (keyof FeatureMetadataInput)[]).filter(
				(k) => input[k] !== undefined,
			),
		},
		target: join(store.metadataDir, 'features', directory, 'feature.json'),
	});
	return updatedFeature;
}

export async function updateFeatureMilestone(
	ctx: FeatureContext,
	projectId: string,
	featureDirectory: string,
	milestoneInput: string,
): Promise<{ feature: ProjectFeatureDto; roadmap: Roadmap }> {
	const store = await ctx.storeForProject(projectId);
	const directory = assertFeatureDirectory(featureDirectory);
	const feature = await readFeatureForMutation(store, directory);
	let roadmap: Roadmap;
	try {
		roadmap = await store.readRoadmap();
	} catch (err) {
		if (isMissingFileError(err)) throw new HttpError('Project has no roadmap.json', 409);
		if (err instanceof Error) throw new HttpError(err.message, 400);
		throw err;
	}
	const milestone = assertRoadmapMilestone(roadmap, milestoneInput);
	const updatedRoadmap: Roadmap = {
		...roadmap,
		features: {
			...roadmap.features,
			[directory]: {
				...(roadmap.features[directory] ?? {}),
				milestone,
			},
		},
	};
	await store.writeRoadmap(updatedRoadmap);
	recordDataMovement({
		category: 'metadata',
		operation: 'feature.milestone',
		status: 'success',
		summary: { featureId: directory, milestone },
		target: join(store.metadataDir, 'roadmap.json'),
	});
	return {
		feature: { ...feature, milestone },
		roadmap: updatedRoadmap,
	};
}
