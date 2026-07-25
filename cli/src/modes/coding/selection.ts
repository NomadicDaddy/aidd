import type { ModeContext, SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	dependenciesAreSatisfied,
	type Feature,
	type FeatureQuery,
	isAuditFinding,
} from 'aidd-shared/metadata/features';
import {
	evaluateRoadmapCodingGate,
	type Roadmap,
	type RoadmapCodingGate,
} from 'aidd-shared/metadata/roadmap';
import { buildRoadmapFromFeatures } from 'aidd-shared/metadata/roadmap-build';
import { InvalidRoadmapError } from 'aidd-shared/metadata/store';

export interface RoadmapScopedQuery {
	gate: null | RoadmapCodingGate;
	query: FeatureQuery;
}

export interface FeatureWorkBreakdown {
	dependencyBlocked: number;
	eligible: number;
	pendingApproval: number;
	remaining: number;
}

export function featureQuery(plan: RunPlan): FeatureQuery {
	const query: FeatureQuery = { filters: plan.scope.filters };
	if (targetsAuditFinding(plan)) query.includeAudit = true;
	// The audit-findings sweep is an explicit opt-in that lifts the default category-Audit
	// exclusion for this run only. An optional source narrows the sweep to one audit's
	// findings by matching each feature's `auditSource`; ordering (severity → priority) is
	// handled downstream by selectNextFeature, whose priority sort already tracks severity
	// (Critical=1 … Low=4).
	if (plan.scope.auditFindings) {
		query.includeAudit = true;
		if (plan.scope.auditFindingsSource) {
			query.filters = [
				...plan.scope.filters,
				{ field: 'auditSource', value: plan.scope.auditFindingsSource },
			];
		}
	}
	if (plan.scope.feature) query.featureDirectory = plan.scope.feature;
	if (plan.prompt.milestone?.featureDirectories) {
		query.milestoneFeatureDirectories = plan.prompt.milestone.featureDirectories;
	}
	return query;
}

function targetsAuditFinding(plan: RunPlan): boolean {
	if (plan.scope.feature?.startsWith('audit-')) return true;
	return plan.scope.filters.some((filter) => {
		return filter.field === 'id' && filter.value.startsWith('audit-');
	});
}

export function explicitFeatureTarget(plan: RunPlan): string | undefined {
	if (plan.scope.feature) return plan.scope.feature;
	const idFilters = plan.scope.filters.filter((filter) => filter.field === 'id');
	if (idFilters.length !== 1) return undefined;
	const [filter] = idFilters;
	if (!filter || filter.value.includes('*')) return undefined;
	return filter.value;
}

// A project without roadmap.json is no longer treated as "roadmap not applicable" — the coding
// milestone/dependency gate must apply to every project. On first encounter we synthesize a
// single-milestone roadmap from the existing feature inventory (all features → v1.0, dependencies
// preserved) and persist it, so from here on the gate runs exactly as it would for a hand-authored
// roadmap. An invalid (non-ENOENT) roadmap still propagates so the caller can surface it.
async function readOrCreateRoadmap(context: ModeContext, allFeatures: Feature[]): Promise<Roadmap> {
	try {
		return await context.store.readRoadmap();
	} catch (err) {
		if (!isMissingRoadmapError(err)) throw err;
		const roadmap = buildRoadmapFromFeatures(allFeatures);
		await context.store.writeRoadmap(roadmap);
		return roadmap;
	}
}

function isMissingRoadmapError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'ENOENT'
	);
}

export async function roadmapScopedQuery(
	context: ModeContext,
	query: FeatureQuery,
	allFeatures: Feature[],
): Promise<RoadmapScopedQuery> {
	const roadmap = await readOrCreateRoadmap(context, allFeatures);
	const gate = evaluateRoadmapCodingGate(roadmap, allFeatures);
	if (gate.blocked || gate.activeMilestone === null) return { gate, query };
	return {
		gate,
		query: {
			...query,
			milestoneFeatureDirectories: gate.allowedFeatureDirectories,
		},
	};
}

const roadmapGateDetailLimit = 10;

// Names the offending feature directories (capped) so the operator can fix the mapping
// without spelunking roadmap.json — the bare count gave them nothing to act on.
export function roadmapGateDetail(gate: RoadmapCodingGate): string {
	if (gate.blockReason === 'invalid_milestone_mapping') {
		const names = gate.invalidMappings
			.slice(0, roadmapGateDetailLimit)
			.map((mapping) => `${mapping.featureDirectory}→'${mapping.milestone}'`);
		const more = gate.invalidMappings.length > roadmapGateDetailLimit ? ', …' : '';
		return `${gate.invalidMappings.length} feature(s) reference an unknown roadmap milestone (${names.join(', ')}${more})`;
	}
	const names = gate.unmappedFeatureDirectories.slice(0, roadmapGateDetailLimit);
	const more = gate.unmappedFeatureDirectories.length > roadmapGateDetailLimit ? ', …' : '';
	return `${gate.unmappedFeatureDirectories.length} feature(s) are missing roadmap milestone assignments (unmapped: ${names.join(', ')}${more})`;
}

export function roadmapNoWork(gate: RoadmapCodingGate): SelectedWork {
	return {
		data: {
			roadmapGate: gate,
			totalCandidates: 0,
		},
		description: `Roadmap gate blocked coding: ${roadmapGateDetail(gate)}`,
		id: 'no-work',
		kind: 'none',
	};
}

export function invalidRoadmapNoWork(error: unknown): SelectedWork {
	const detail = roadmapErrorDetail(error);
	return {
		data: {
			roadmapGate: {
				activeMilestone: null,
				allowedFeatureDirectories: [],
				blocked: true,
				blockReason: 'invalid_roadmap',
				errorMessage: detail.message,
				...(detail.filePath !== undefined ? { errorFilePath: detail.filePath } : {}),
				...(detail.position !== undefined ? { errorPosition: detail.position } : {}),
				...(detail.snippet !== undefined ? { errorSnippet: detail.snippet } : {}),
			},
			totalCandidates: 0,
		},
		description: `Roadmap gate blocked coding: roadmap.json is invalid (${detail.message})`,
		id: 'no-work',
		kind: 'none',
	};
}

export function roadmapErrorDetail(error: unknown): {
	filePath?: string;
	message: string;
	position?: { column: number; line: number; offset: number };
	snippet?: string;
} {
	if (error instanceof InvalidRoadmapError) {
		return {
			filePath: error.filePath,
			message: error.message,
			...(error.position !== undefined ? { position: error.position } : {}),
			...(error.snippet !== undefined ? { snippet: error.snippet } : {}),
		};
	}
	return { message: error instanceof Error ? error.message : String(error) };
}

export function featureTargetBlockedByRoadmap(
	target: string | undefined,
	allFeatures: Feature[],
	gate: null | RoadmapCodingGate,
): SelectedWork | undefined {
	if (!target || !gate || gate.blocked || gate.activeMilestone === null) return undefined;
	const feature = allFeatures.find(
		(candidate) => candidate.id === target || candidate.directory === target,
	);
	if (!feature) return undefined;
	const featureDirectory = feature.directory ?? feature.id;
	if (gate.allowedFeatureDirectories.includes(featureDirectory)) return undefined;
	return {
		data: {
			requestedFeature: featureDirectory,
			roadmapGate: gate,
			totalCandidates: 0,
		},
		description: `Roadmap gate blocked coding: ${featureDirectory} is outside active milestone '${gate.activeMilestone}'`,
		id: 'no-work',
		kind: 'none',
	};
}

export function milestoneTargetBlockedByRoadmap(
	plan: RunPlan,
	gate: null | RoadmapCodingGate,
): SelectedWork | undefined {
	if (!plan.scope.milestone || !gate || gate.blocked || gate.activeMilestone === null) {
		return undefined;
	}
	if (plan.scope.milestone === gate.activeMilestone) return undefined;
	return {
		data: {
			activeMilestone: gate.activeMilestone,
			requestedMilestone: plan.scope.milestone,
			roadmapGate: gate,
			totalCandidates: 0,
		},
		description: `Roadmap gate blocked coding: requested milestone '${plan.scope.milestone}' is outside active milestone '${gate.activeMilestone}'`,
		id: 'no-work',
		kind: 'none',
	};
}

export function featureWorkBreakdown(
	features: Feature[],
	allFeatures: Feature[],
	includeAudit: boolean,
): FeatureWorkBreakdown {
	const remainingFeatures = features.filter((feature) => feature.passes !== true);
	const pendingApproval = remainingFeatures.filter(
		(feature) => feature.status === 'waiting_approval',
	);
	const otherwiseEligible = remainingFeatures
		.filter((feature) => feature.status !== 'waiting_approval')
		.filter((feature) => includeAudit || !isAuditFinding(feature));
	const dependencyBlocked = otherwiseEligible.filter(
		(feature) => !dependenciesAreSatisfied(feature, allFeatures),
	);
	return {
		dependencyBlocked: dependencyBlocked.length,
		eligible: otherwiseEligible.length - dependencyBlocked.length,
		pendingApproval: pendingApproval.length,
		remaining: remainingFeatures.length,
	};
}

export function noWorkDescription(breakdown: FeatureWorkBreakdown): string {
	if (
		breakdown.pendingApproval > 0 &&
		breakdown.eligible === 0 &&
		breakdown.dependencyBlocked === 0
	) {
		return `No approved incomplete coding features are available; ${breakdown.pendingApproval} feature(s) are pending approval`;
	}
	if (breakdown.dependencyBlocked > 0) {
		const pendingSuffix =
			breakdown.pendingApproval > 0
				? `; ${breakdown.pendingApproval} feature(s) are pending approval`
				: '';
		return `No eligible incomplete coding features are available; ${breakdown.dependencyBlocked} feature(s) are dependency-blocked${pendingSuffix}`;
	}
	return 'No incomplete coding features are available';
}

export function noWorkSummary(breakdown: FeatureWorkBreakdown): string {
	if (breakdown.remaining === 0) return 'coding has no incomplete feature work';
	if (
		breakdown.pendingApproval > 0 &&
		breakdown.eligible === 0 &&
		breakdown.dependencyBlocked === 0
	) {
		return `coding has no approved incomplete feature work; ${breakdown.pendingApproval} feature(s) pending approval`;
	}
	if (breakdown.dependencyBlocked > 0) {
		const pendingSuffix =
			breakdown.pendingApproval > 0
				? `; ${breakdown.pendingApproval} feature(s) pending approval`
				: '';
		return `coding has no eligible incomplete feature work; ${breakdown.dependencyBlocked} feature(s) dependency-blocked${pendingSuffix}`;
	}
	return 'coding has no incomplete feature work';
}
