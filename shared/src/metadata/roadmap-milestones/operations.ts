import type { Feature } from '../features.ts';
import type { Roadmap } from '../roadmap.ts';
import type { MilestoneMove, MilestonePlan } from './types.ts';

import { orderedMilestoneNames } from '../roadmap.ts';
import { repairPlacement } from './placement.ts';
import { reconcileShippedPlacement } from './version-mapping.ts';

export type MilestoneOperationErrorCode =
	| 'duplicate_name'
	| 'invalid_name'
	| 'invalid_position'
	| 'last_milestone'
	| 'unknown_milestone'
	| 'unknown_target';

export class MilestoneOperationError extends Error {
	readonly code: MilestoneOperationErrorCode;

	constructor(code: MilestoneOperationErrorCode, message: string) {
		super(message);
		this.code = code;
	}
}

const MILESTONE_NAME_MAX_LENGTH = 200;

/** Milestone names are JSON keys, roadmap values, and URL path segments, so all three have to hold. */
function assertMilestoneName(value: string): string {
	const name = value.trim();
	if (name.length === 0 || name.length > MILESTONE_NAME_MAX_LENGTH) {
		throw new MilestoneOperationError(
			'invalid_name',
			`Milestone name must be 1-${MILESTONE_NAME_MAX_LENGTH} characters`,
		);
	}
	if (name.includes('/') || name.includes('\\') || /\p{Cc}/u.test(name)) {
		throw new MilestoneOperationError(
			'invalid_name',
			'Milestone name cannot contain slashes or control characters',
		);
	}
	if (name === '__proto__') {
		// Assigning this key mutates the prototype instead of creating a property, so the milestone
		// would vanish and the operation would still report success.
		throw new MilestoneOperationError('invalid_name', 'Milestone name cannot be __proto__');
	}
	return name;
}

function assertKnownMilestone(roadmap: Roadmap, name: string): string {
	if (!Object.prototype.hasOwnProperty.call(roadmap.milestones, name)) {
		throw new MilestoneOperationError(
			'unknown_milestone',
			`Unknown roadmap milestone: ${name}`,
		);
	}
	return name;
}

/**
 * Rebuilds the milestone map so `priority` is a contiguous 1..N matching `order` exactly.
 *
 * The `next[name] =` assignment is only safe because `assertMilestoneName` rejects `__proto__`
 * upstream — assigning that key would invoke the prototype setter and drop the milestone silently.
 */
function applyOrder(milestones: Roadmap['milestones'], order: string[]): Roadmap['milestones'] {
	const next: Roadmap['milestones'] = {};
	order.forEach((name, index) => {
		const entry = milestones[name];
		if (entry) next[name] = { ...entry, priority: index + 1 };
	});
	return next;
}

function resolvePosition(requested: number | undefined, fallback: number, limit: number): number {
	if (requested === undefined) return fallback;
	if (!Number.isInteger(requested) || requested < 1 || requested > limit) {
		throw new MilestoneOperationError(
			'invalid_position',
			`Position must be an integer between 1 and ${limit}`,
		);
	}
	return requested;
}

function withDescription(
	entry: Record<string, unknown>,
	description: string | undefined,
): Record<string, unknown> {
	if (description === undefined) return entry;
	const trimmed = description.trim();
	if (trimmed.length > 0) return { ...entry, description: trimmed };
	const { description: _dropped, ...rest } = entry;
	return rest;
}

export interface CreateMilestoneInput {
	description?: string;
	/** 1-based slot in priority order. Defaults to appending after the last milestone. */
	position?: number;
}

export function planMilestoneCreate(
	roadmap: Roadmap,
	features: Feature[],
	rawName: string,
	input: CreateMilestoneInput = {},
): MilestonePlan {
	const name = assertMilestoneName(rawName);
	if (Object.prototype.hasOwnProperty.call(roadmap.milestones, name)) {
		throw new MilestoneOperationError('duplicate_name', `Milestone already exists: ${name}`);
	}
	const order = orderedMilestoneNames(roadmap);
	const position = resolvePosition(input.position, order.length + 1, order.length + 1);
	const nextOrder = [...order];
	nextOrder.splice(position - 1, 0, name);
	const milestones = applyOrder(
		{ ...roadmap.milestones, [name]: withDescription({}, input.description) },
		nextOrder,
	);
	return repairPlacement({ ...roadmap, milestones }, features);
}

export interface UpdateMilestoneInput {
	description?: string;
	name?: string;
	position?: number;
}

export function planMilestoneUpdate(
	roadmap: Roadmap,
	features: Feature[],
	target: string,
	input: UpdateMilestoneInput,
): MilestonePlan {
	assertKnownMilestone(roadmap, target);
	const name = input.name === undefined ? target : assertMilestoneName(input.name);
	if (name !== target && Object.prototype.hasOwnProperty.call(roadmap.milestones, name)) {
		throw new MilestoneOperationError('duplicate_name', `Milestone already exists: ${name}`);
	}
	const order = orderedMilestoneNames(roadmap);
	const currentIndex = order.indexOf(target);
	const position = resolvePosition(input.position, currentIndex + 1, order.length);

	const renamed = order.map((entry) => (entry === target ? name : entry));
	const nextOrder = [...renamed];
	nextOrder.splice(currentIndex, 1);
	nextOrder.splice(position - 1, 0, name);

	const { [target]: previous, ...others } = roadmap.milestones;
	const milestones = applyOrder(
		{ ...others, [name]: withDescription({ ...previous }, input.description) },
		nextOrder,
	);

	// A rename moves every mapping that pointed at the old key. Seeded rather than rewritten in place
	// so the plan can show the operator each feature that follows the name.
	const seedMoves: MilestoneMove[] =
		name === target
			? []
			: Object.entries(roadmap.features)
					.filter(([, entry]) => entry.milestone === target)
					.map(([featureDirectory]) => ({
						featureDirectory,
						from: target,
						reason: 'rename' as const,
						to: name,
					}));
	return repairPlacement({ ...roadmap, milestones }, features, seedMoves);
}

export interface DeleteMilestoneInput {
	/** Where this milestone's features land. Defaults to the next milestone, or the previous one
	 *  when deleting the last. */
	targetMilestone?: string;
}

export function planMilestoneDelete(
	roadmap: Roadmap,
	features: Feature[],
	target: string,
	input: DeleteMilestoneInput = {},
): MilestonePlan {
	assertKnownMilestone(roadmap, target);
	const order = orderedMilestoneNames(roadmap);
	if (order.length <= 1) {
		throw new MilestoneOperationError(
			'last_milestone',
			'Cannot delete the only milestone — every feature would be left unmapped, which blocks all coding runs',
		);
	}
	const index = order.indexOf(target);
	const fallback = order[index + 1] ?? order[index - 1];
	const destination = input.targetMilestone ?? fallback;
	if (destination === undefined || destination === target) {
		throw new MilestoneOperationError(
			'unknown_target',
			'No milestone available to receive the deleted milestone’s features',
		);
	}
	assertKnownMilestoneTarget(roadmap, destination);

	const nextOrder = order.filter((name) => name !== target);
	const { [target]: _removed, ...milestones } = roadmap.milestones;
	const seedMoves: MilestoneMove[] = Object.entries(roadmap.features)
		.filter(([, entry]) => entry.milestone === target)
		.map(([featureDirectory]) => ({
			featureDirectory,
			from: target,
			reason: 'delete-cascade' as const,
			to: destination,
		}));
	return repairPlacement(
		{ ...roadmap, milestones: applyOrder(milestones, nextOrder) },
		features,
		seedMoves,
	);
}

function assertKnownMilestoneTarget(roadmap: Roadmap, name: string): void {
	if (!Object.prototype.hasOwnProperty.call(roadmap.milestones, name)) {
		throw new MilestoneOperationError('unknown_target', `Unknown target milestone: ${name}`);
	}
}

export interface ReassignOptions {
	/** The target app's package.json version, used to place (and backfill) completed features that
	 *  never got `shippedVersion` stamped. Null/absent skips backfilling. */
	appVersion?: null | string;
}

/**
 * Dependency-safe re-placement with no milestone change: repairs unmapped features and violations,
 * and pulls completed features back from milestones ahead of the version they actually shipped in
 * (never forward — see reconcileShippedPlacement). Only completed features are seeded earlier — the
 * dependency pass still only pushes later, so a completed feature whose dependency sits in a later
 * milestone is pushed back (reason `dependency`) rather than the invariant being silently violated;
 * the conflict stays visible in the plan preview.
 */
export function planMilestoneReassign(
	roadmap: Roadmap,
	features: Feature[],
	options: ReassignOptions = {},
): MilestonePlan {
	const { backfills, seedMoves } = reconcileShippedPlacement(
		roadmap,
		features,
		options.appVersion ?? null,
	);
	return { ...repairPlacement(roadmap, features, seedMoves), backfills };
}
