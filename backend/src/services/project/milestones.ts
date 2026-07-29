import type { Feature } from 'aidd-shared/metadata/features';
import type { Roadmap } from 'aidd-shared/metadata/roadmap';
import type { MilestonePlan } from 'aidd-shared/metadata/roadmap-milestones';
import type { FileAiddStore } from 'aidd-shared/metadata/store';

import { featureNodeId } from 'aidd-shared/metadata/features';
import { orderedMilestoneNames } from 'aidd-shared/metadata/roadmap';
import {
	MilestoneOperationError,
	planMilestoneCreate,
	planMilestoneDelete,
	planMilestoneReassign,
	planMilestoneUpdate,
} from 'aidd-shared/metadata/roadmap-milestones';
import { join } from 'node:path';

import type {
	MilestoneCreateInputDto,
	MilestoneDeleteInputDto,
	MilestoneUpdateInputDto,
	ProjectMilestonePlanDto,
	ProjectMilestonesViewDto,
} from '../../types/project/milestones.ts';
import type { FeatureContext } from './features.ts';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import { readAppVersion } from '../projectMetadata/versionHelpers.ts';
import { buildMilestonesView, reordersExistingMilestones } from './milestonesView.ts';
import { syncFeaturePriorities, syncShippedVersions } from './milestoneSync.ts';

export type MilestoneContext = FeatureContext;

// Injected the same way deleteProject/moveProject take it, so the run store stays out of here.
export type HasActiveRuns = (projectPath: string) => Promise<boolean>;

type MilestoneOperation = 'create' | 'delete' | 'reassign' | 'update';

interface MilestoneState {
	features: Feature[];
	roadmap: Roadmap;
	store: FileAiddStore;
}

function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'ENOENT'
	);
}

async function loadState(ctx: MilestoneContext, projectId: string): Promise<MilestoneState> {
	const store = await ctx.storeForProject(projectId);
	let roadmap: Roadmap;
	try {
		roadmap = await store.readRoadmap();
	} catch (err) {
		if (isMissingFileError(err)) throw new HttpError('Project has no roadmap.json', 409);
		if (err instanceof Error) throw new HttpError(err.message, 400);
		throw err;
	}
	return { features: await store.listFeatures({ includeAudit: true }), roadmap, store };
}

// Milestone names travel in the URL path, so reject the separators before they reach the planner.
export function assertMilestoneParam(name: string): string {
	if (name.length === 0 || name.includes('/') || name.includes('\\')) {
		throw new HttpError('Invalid milestone name', 400);
	}
	return name;
}

const OPERATION_ERROR_STATUS: Record<string, number> = {
	duplicate_name: 400,
	invalid_name: 400,
	invalid_position: 400,
	last_milestone: 409,
	unknown_milestone: 404,
	unknown_target: 400,
};

function toHttpError(error: unknown): unknown {
	if (!(error instanceof MilestoneOperationError)) return error;
	return new HttpError(error.message, OPERATION_ERROR_STATUS[error.code] ?? 400);
}

function plan(
	state: MilestoneState,
	build: (state: MilestoneState) => MilestonePlan,
): MilestonePlan {
	try {
		return build(state);
	} catch (err) {
		throw toHttpError(err);
	}
}

// Applies a plan, or previews it. Both paths return the same payload so the confirm dialog renders
// the preview and the apply is the identical request with dryRun cleared — there is no second code
// path that could disagree with what the operator approved.
async function settle(
	state: MilestoneState,
	milestonePlan: MilestonePlan,
	operation: MilestoneOperation,
	options: { dryRun: boolean; hasActiveRuns: HasActiveRuns },
): Promise<ProjectMilestonePlanDto> {
	if (!options.dryRun) {
		await assertQuiescent(state, milestonePlan, options.hasActiveRuns);
		await state.store.writeRoadmap(milestonePlan.roadmap);
		// Backfills before priorities: both rewrite feature.json via re-read, so a priority write
		// after the backfill preserves it, while the reverse order would also work — the fixed order
		// just keeps the writes deterministic for the data-movement trace.
		await syncShippedVersions(state.store, milestonePlan);
		await syncFeaturePriorities(state.store, milestonePlan);
		recordDataMovement({
			category: 'metadata',
			operation: `milestone.${operation}`,
			status: 'success',
			summary: {
				backfills: milestonePlan.backfills.length,
				moves: milestonePlan.moves.length,
				priorityUpdates: milestonePlan.priorityUpdates.length,
			},
			target: join(state.store.metadataDir, 'roadmap.json'),
		});
	}
	const view: ProjectMilestonesViewDto = buildMilestonesView(
		milestonePlan.roadmap,
		applyPriorities(state.features, milestonePlan),
	);
	return {
		applied: !options.dryRun,
		backfills: milestonePlan.backfills,
		moves: milestonePlan.moves,
		priorityUpdates: milestonePlan.priorityUpdates,
		view,
		violations: milestonePlan.violations,
		warnings: milestonePlan.warnings,
	};
}

// A run in flight has already been handed the active milestone's feature list. Moving features or
// resequencing existing milestones under it would change what the gate admits mid-run, so those
// operations wait; description edits and appended milestones do not touch either and go through.
//
// `priorityUpdates` counts as disruptive even though it changes no milestone membership, because
// settling one rewrites feature.json files. A description-only edit normally produces none; it
// produces them only when it happens to repair pre-existing priority drift, and that is exactly the
// case where an unguarded write would land on top of a running agent's edits.
async function assertQuiescent(
	state: MilestoneState,
	milestonePlan: MilestonePlan,
	hasActiveRuns: HasActiveRuns,
): Promise<void> {
	const disruptive =
		milestonePlan.moves.length > 0 ||
		milestonePlan.priorityUpdates.length > 0 ||
		milestonePlan.backfills.length > 0 ||
		reordersExistingMilestones(
			orderedMilestoneNames(state.roadmap),
			orderedMilestoneNames(milestonePlan.roadmap),
		);
	if (!disruptive) return;
	if (await hasActiveRuns(state.store.projectDir)) {
		throw new HttpError(
			'Project has active runs — milestone changes that move features or rewrite feature files are blocked',
			409,
		);
	}
}

function applyPriorities(features: Feature[], milestonePlan: MilestonePlan): Feature[] {
	const updates = new Map(
		milestonePlan.priorityUpdates.map((entry) => [entry.featureDirectory, entry.to]),
	);
	return features.map((feature) => {
		const priority = updates.get(featureNodeId(feature));
		return priority === undefined ? feature : { ...feature, priority };
	});
}

export async function getMilestones(
	ctx: MilestoneContext,
	projectId: string,
): Promise<ProjectMilestonesViewDto> {
	const state = await loadState(ctx, projectId);
	return buildMilestonesView(state.roadmap, state.features);
}

export async function createMilestone(
	ctx: MilestoneContext,
	projectId: string,
	input: MilestoneCreateInputDto,
	hasActiveRuns: HasActiveRuns,
): Promise<ProjectMilestonePlanDto> {
	const state = await loadState(ctx, projectId);
	const built = plan(state, (current) =>
		planMilestoneCreate(current.roadmap, current.features, input.name, {
			...(input.description === undefined ? {} : { description: input.description }),
			...(input.position === undefined ? {} : { position: input.position }),
		}),
	);
	return settle(state, built, 'create', { dryRun: input.dryRun === true, hasActiveRuns });
}

export async function updateMilestone(
	ctx: MilestoneContext,
	projectId: string,
	milestone: string,
	input: MilestoneUpdateInputDto,
	hasActiveRuns: HasActiveRuns,
): Promise<ProjectMilestonePlanDto> {
	const name = assertMilestoneParam(milestone);
	const state = await loadState(ctx, projectId);
	const built = plan(state, (current) =>
		planMilestoneUpdate(current.roadmap, current.features, name, {
			...(input.description === undefined ? {} : { description: input.description }),
			...(input.name === undefined ? {} : { name: input.name }),
			...(input.position === undefined ? {} : { position: input.position }),
		}),
	);
	return settle(state, built, 'update', { dryRun: input.dryRun === true, hasActiveRuns });
}

export async function deleteMilestone(
	ctx: MilestoneContext,
	projectId: string,
	milestone: string,
	input: MilestoneDeleteInputDto,
	hasActiveRuns: HasActiveRuns,
): Promise<ProjectMilestonePlanDto> {
	const name = assertMilestoneParam(milestone);
	const state = await loadState(ctx, projectId);
	const built = plan(state, (current) =>
		planMilestoneDelete(current.roadmap, current.features, name, {
			...(input.targetMilestone === undefined
				? {}
				: { targetMilestone: input.targetMilestone }),
		}),
	);
	return settle(state, built, 'delete', { dryRun: input.dryRun === true, hasActiveRuns });
}

export async function reassignMilestones(
	ctx: MilestoneContext,
	projectId: string,
	input: { dryRun?: boolean },
	hasActiveRuns: HasActiveRuns,
): Promise<ProjectMilestonePlanDto> {
	const state = await loadState(ctx, projectId);
	const appVersion = await readAppVersion(state.store.projectDir);
	const built = plan(state, (current) =>
		planMilestoneReassign(current.roadmap, current.features, { appVersion }),
	);
	return settle(state, built, 'reassign', { dryRun: input.dryRun === true, hasActiveRuns });
}
