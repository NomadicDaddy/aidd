import type { ModeContext, SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	createAuditFreshnessContext,
	evaluateAuditReportFreshness,
} from 'aidd-shared/metadata/audit-freshness';
import {
	buildScoreInput,
	collectProjectEvidence,
	compareAuditsByChangePotential,
	enumerateProjectsUnderRoots,
	loadAuditPriorities,
	scoreAudit,
	type ChangePotential,
	type ProjectAuditEvidence,
} from 'aidd-shared/metadata/audit-scoring';
import { filterApplicableAuditNames } from 'aidd-shared/metadata/project-profile';
import { discoverAuditNames, simulationMarker } from 'aidd-shared/modes/audit-shared';

export function explicitAuditNames(plan: RunPlan): string[] {
	return plan.audit?.names ?? [];
}

export function selectedAuditNames(plan: RunPlan, work: SelectedWork | undefined): string[] {
	const batch = currentBatch(work?.data);
	if (batch.length > 0) return batch;
	if (work?.id && work.id !== 'audit-batch' && work.id !== 'no-work') return [work.id];
	return [currentAuditName(plan)];
}

function currentBatch(data: unknown): string[] {
	if (typeof data !== 'object' || data === null) return [];
	const currentBatchValue = (data as { currentBatch?: unknown }).currentBatch;
	if (!Array.isArray(currentBatchValue)) return [];
	return currentBatchValue.filter((item): item is string => typeof item === 'string');
}

export function currentAuditName(plan: RunPlan): string {
	return plan.audit?.current ?? plan.audit?.names[0] ?? 'AUDIT';
}

export async function auditNames(plan: RunPlan, context: ModeContext): Promise<string[]> {
	const names = plan.audit?.names ?? [];
	if (names.length > 0) return names;
	if (plan.audit?.runAll) {
		const catalogDir = context.rootDir ?? process.cwd();
		const discovered = await discoverAuditNames(catalogDir);
		if (discovered.length > 0) {
			const applicable = await filterApplicableAuditNames(
				catalogDir,
				context.projectDir,
				discovered
			);
			return await rankAuditsByChangePotential(applicable, catalogDir, context);
		}
	}
	return [currentAuditName(plan)];
}

// Ranks `--audit-all` discovery output descending by change-potential score. Explicit
// `--audit X,Y` selection bypasses this ranker — see `auditNamesForSelection`. Evidence
// is gathered from the current project plus every project under `context.scoringRoots`
// (deduplicated), matching the spec at aidd-audit-change-potential-ranking.md line 91.
async function rankAuditsByChangePotential(
	audits: string[],
	catalogDir: string,
	context: ModeContext
): Promise<string[]> {
	if (audits.length <= 1) return audits;
	const [priorities, projects] = await Promise.all([
		loadAuditPriorities(catalogDir, audits),
		collectAllProjectEvidence(context),
	]);
	const scores = new Map<string, ChangePotential>();
	for (const name of audits) {
		const upper = name.toUpperCase();
		scores.set(upper, scoreAudit(buildScoreInput(upper, { priorities, projects })));
	}
	return [...audits].sort((left, right) => compareAuditsByChangePotential(left, right, scores));
}

async function collectAllProjectEvidence(context: ModeContext): Promise<ProjectAuditEvidence[]> {
	const projectDirs = await enumerateProjectsUnderRoots(context.scoringRoots ?? []);
	const unique = new Set<string>([context.projectDir, ...projectDirs]);
	return await Promise.all([...unique].map((dir) => collectProjectEvidence(dir)));
}

export async function auditNamesForSelection(
	plan: RunPlan,
	context: ModeContext,
	explicitRetryAudits: string[] | undefined
): Promise<string[]> {
	const explicitNames = explicitAuditNames(plan);
	if (explicitRetryAudits !== undefined) return explicitRetryAudits;
	if (explicitNames.length > 0) return explicitNames;
	return await remainingAuditNames(plan, context);
}

export async function remainingAfterResult(
	plan: RunPlan,
	context: ModeContext,
	selectedAudits: string[],
	completedAudits: string[],
	batchIncomplete: boolean
): Promise<string[]> {
	const explicitNames = explicitAuditNames(plan);
	if (explicitNames.length > 0) {
		const missingAudits = selectedAudits.filter((name) => !completedAudits.includes(name));
		return missingAudits.length > 0 || !batchIncomplete ? missingAudits : selectedAudits;
	}
	return (await remainingAuditNames(plan, context)).filter(
		(name) => !completedAudits.includes(name)
	);
}

async function remainingAuditNames(plan: RunPlan, context: ModeContext): Promise<string[]> {
	const names = await auditNames(plan, context);
	const freshnessContext = createAuditFreshnessContext();
	const results = await Promise.all(
		names.map(async (name) => ({
			freshness: await evaluateAuditReportFreshness(context.projectDir, name, {
				context: freshnessContext,
				excludedReportMarker: simulationMarker,
			}),
			name,
		}))
	);
	return results
		.filter((result) => result.freshness.status !== 'fresh')
		.map((result) => result.name);
}
