import type { ModeContext, SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	createAuditFreshnessContext,
	evaluateAuditReportFreshness,
} from 'aidd-shared/metadata/audit-freshness';
import {
	buildScoreInput,
	type ChangePotential,
	collectProjectEvidence,
	compareAuditsByChangePotential,
	enumerateProjectsUnderRoots,
	loadAuditPriorities,
	type ProjectAuditEvidence,
	scoreAudit,
} from 'aidd-shared/metadata/audit-scoring';
import {
	explicitProjectProfileError,
	filterApplicableAuditNames,
} from 'aidd-shared/metadata/project-profile';
import {
	discoverAuditNames,
	simulationMarker,
	unavailableMarker,
} from 'aidd-shared/modes/audit-shared';

// The one audit an agent session was given: selected work is always a single audit, and its
// id is that audit's name.
export function selectedAuditName(plan: RunPlan, work: SelectedWork | undefined): string {
	return work?.id && work.id !== 'no-work' ? work.id : currentAuditName(plan);
}

function currentAuditName(plan: RunPlan): string {
	return plan.audit?.current ?? plan.audit?.names[0] ?? 'AUDIT';
}

export async function auditNames(plan: RunPlan, context: ModeContext): Promise<string[]> {
	const names = plan.audit?.names ?? [];
	if (names.length > 0) return names;
	if (plan.audit?.runAll) {
		const catalogDir = context.rootDir ?? process.cwd();
		const discovered = await discoverAuditNames(catalogDir);
		if (discovered.length > 0) {
			await warnOnRejectedProfile(context.projectDir);
			const applicable = await filterApplicableAuditNames(
				catalogDir,
				context.projectDir,
				discovered,
			);
			return await rankAuditsByChangePotential(applicable, catalogDir, context);
		}
	}
	return [currentAuditName(plan)];
}

// Selection runs once per iteration, so each project is reported once per process.
const reportedRejectedProfiles = new Set<string>();

async function warnOnRejectedProfile(projectDir: string): Promise<void> {
	if (reportedRejectedProfiles.has(projectDir)) return;
	const error = await explicitProjectProfileError(projectDir);
	if (error === null) return;
	reportedRejectedProfiles.add(projectDir);
	console.warn(
		`[audit] .aidd/project-profile.json is invalid and was ignored; audits are chosen from the inferred profile instead. Fix the file to restore its facets: ${error}`,
	);
}

// Ranks `--audit-all` discovery output descending by change-potential score. Explicit
// `--audit X,Y` selection bypasses this ranker — see `pendingAuditNames`. Evidence
// is gathered from the current project plus every project under `context.scoringRoots`,
// each project once: the scorer reads the whole configured fleet, not only the project being run.
async function rankAuditsByChangePotential(
	audits: string[],
	catalogDir: string,
	context: ModeContext,
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

/**
 * The audits a run still has to attempt, in the order it will attempt them — the head of this
 * list is the one audit the next agent session is given.
 *
 * Explicit `--audit X,Y` names are taken as given and in the order given: naming an audit asks
 * for it to run whatever the age of its report. `--audit-all` takes only the audits whose
 * evidence is stale, in ranked order. Either way an audit the run has already settled — done,
 * unable to run, or given up on — is never offered again, which is what stops a run from
 * re-selecting an audit that will not come good.
 * @param plan The run plan carrying the audit selection flags.
 * @param context The mode context naming the project whose reports are read.
 * @param requested Every audit the run was asked for, as `auditNames` resolved it.
 * @param settled The audits this run is finished with.
 * @returns The pending audit names, next first.
 */
export async function pendingAuditNames(
	plan: RunPlan,
	context: ModeContext,
	requested: readonly string[],
	settled: ReadonlySet<string>,
): Promise<string[]> {
	const namedExplicitly = (plan.audit?.names ?? []).length > 0;
	const candidates = namedExplicitly
		? requested
		: await staleAuditNames(context.projectDir, requested);
	return candidates.filter((name) => !settled.has(name));
}

// A simulated report and a could-not-run report are both on disk without being audit evidence,
// so neither makes its audit fresh.
async function staleAuditNames(projectDir: string, names: readonly string[]): Promise<string[]> {
	const freshnessContext = createAuditFreshnessContext();
	const results = await Promise.all(
		names.map(async (name) => ({
			freshness: await evaluateAuditReportFreshness(projectDir, name, {
				context: freshnessContext,
				excludedReportMarkers: [simulationMarker, unavailableMarker],
			}),
			name,
		})),
	);
	return results
		.filter((result) => result.freshness.status !== 'fresh')
		.map((result) => result.name);
}
