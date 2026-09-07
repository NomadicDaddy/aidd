import type { AuditFreshnessContext } from 'aidd-shared/metadata/audit-freshness';
import type { Feature } from 'aidd-shared/metadata/features';
import type { DetectProjectStackOptions } from 'aidd-shared/metadata/project-stack';
import type { FileAiddStore } from 'aidd-shared/metadata/store';

import { readCliActiveRunRecords } from 'aidd-shared/metadata/active-runs';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { readProjectAssuranceProfile } from 'aidd-shared/metadata/project-profile';
import { join } from 'node:path';

import type {
	MaturityBadgeDto,
	MaturityDto,
	ProjectArtifactCheckSummary,
	ProjectMetadataDto,
	WebFeatureStats,
} from '../types.ts';
import type { MaturityComputeInput } from './maturityCompute.ts';

import { getProjectInterviewProgress } from './interviewService.ts';
import { computeMaturity, toMaturityBadge } from './maturityCompute.ts';

// Re-export from extracted modules
export {
	gatherLocalIterations,
	gatherLocalRuns,
	gatherRunLedgerMetadata,
} from './projectMetadata/iterationLogHelpers.ts';

import {
	countNumberedListItems,
	countScreenMapRoutes,
	gatherAddedAt,
	gatherPorts,
	gatherRoadmap,
	gatherSpecUpdatedAt,
	gatherVersionInfo,
} from './projectMetadata/versionHelpers.ts';
export { gatherPorts };
import { gatherArtifactCheckSummary } from './projectMetadata/artifactHelpers.ts';
import {
	excludeOrphanIterations,
	gatherLocalIterations,
	gatherRunLedgerMetadata,
	reconcileIterationLiveness,
	syncStateFromLocalData,
} from './projectMetadata/iterationLogHelpers.ts';

export interface MaturityContext {
	auditCatalogDir: string;
	auditCatalogNames: readonly string[];
	getLatestProjectAuditRun: (
		projectPath: string,
	) => Promise<MaturityComputeInput['latestProjectAuditRun']>;
}

function emptyMaturityBadge(): MaturityBadgeDto {
	return {
		currentStageId: null,
		currentStageLabel: null,
		nextArtifactLabel: null,
		nextArtifactSlug: null,
		percent: 0,
		stageStatuses: [],
	};
}

export interface GatherProjectMetadataOptions {
	artifactCheck?: ProjectArtifactCheckSummary;
	auditFreshnessContext?: AuditFreshnessContext;
	features?: Feature[];
	featureStats?: WebFeatureStats;
	maturityContext?: MaturityContext;
	stackOptions?: DetectProjectStackOptions;
}

export async function gatherProjectMetadata(
	projectDir: string,
	store: FileAiddStore,
	options: GatherProjectMetadataOptions = {},
): Promise<{ maturityDetail: MaturityDto | null } & ProjectMetadataDto> {
	const metadataDir = metadataPath(projectDir);
	// If a caller already ran a fresh artifact check (e.g. the project detail endpoint),
	// use that instead of the stale cached .artifacts-check.json so maturity and metadata
	// agree on the same artifact state. This prevents the "top says roadmap exists /
	// bottom says roadmap does not exist" mismatch when roadmap.json was added after the
	// cached check was written.
	const artifactCheckPromise =
		options.artifactCheck !== undefined
			? Promise.resolve(options.artifactCheck)
			: gatherArtifactCheckSummary(metadataDir);
	const [
		versionInfo,
		ports,
		specUpdatedAt,
		addedAt,
		roadmap,
		screenMapRouteCount,
		testScenariosCount,
		interview,
		rawLocalIterations,
		runLedger,
		artifactCheck,
		profile,
		liveActiveRuns,
	] = await Promise.all([
		gatherVersionInfo(projectDir, options.stackOptions),
		gatherPorts(projectDir),
		gatherSpecUpdatedAt(metadataDir),
		gatherAddedAt(projectDir),
		gatherRoadmap(store, options.features),
		countScreenMapRoutes(join(metadataDir, 'screen-map.md')),
		countNumberedListItems(join(metadataDir, 'testing-scenarios.md')),
		getProjectInterviewProgress(projectDir),
		gatherLocalIterations(metadataDir),
		gatherRunLedgerMetadata(metadataDir),
		artifactCheckPromise,
		readProjectAssuranceProfile(projectDir),
		readCliActiveRunRecords(projectDir).catch(() => []),
	]);
	const { localRuns, runIds: ledgerRunIds, usage } = runLedger;
	// A 'started' iteration artifact reads as 'running'; reconcile that against active-runs/ so an
	// abandoned run (no live record) is surfaced as terminal rather than a perpetual in-progress row.
	const liveActiveRunIds = new Set(liveActiveRuns.map((run) => run.id));
	const reconciledIterations = reconcileIterationLiveness(rawLocalIterations, liveActiveRunIds);
	// Then drop iterations belonging to an orphaned run (runId absent from the ledger and not live)
	// so the run-history views never surface phantom rows the runs.jsonl baseline does not record.
	const localIterations = excludeOrphanIterations(
		reconciledIterations,
		ledgerRunIds,
		liveActiveRunIds,
	);
	let maturityDetail: MaturityDto | null = null;
	let maturity: MaturityBadgeDto = emptyMaturityBadge();
	if (options.maturityContext && options.featureStats) {
		const latestProjectAuditRun =
			await options.maturityContext.getLatestProjectAuditRun(projectDir);
		maturityDetail = await computeMaturity({
			artifactCheck,
			auditCatalogDir: options.maturityContext.auditCatalogDir,
			auditCatalogNames: [...options.maturityContext.auditCatalogNames],
			...(options.auditFreshnessContext
				? { auditFreshnessContext: options.auditFreshnessContext }
				: {}),
			featureStats: options.featureStats,
			interview,
			latestProjectAuditRun,
			profile,
			projectDir,
		});
		maturity = toMaturityBadge(maturityDetail);
	}
	return {
		addedAt,
		appVersion: versionInfo.appVersion,
		artifactCheck,
		interview,
		localIterations,
		localRuns,
		maturity,
		maturityDetail,
		ports,
		profile,
		roadmap,
		screenMapRouteCount,
		specUpdatedAt,
		stack: versionInfo.stack,
		sync: syncStateFromLocalData(localRuns, localIterations),
		templateVersion: versionInfo.templateVersion,
		testScenariosCount,
		usage,
	};
}
