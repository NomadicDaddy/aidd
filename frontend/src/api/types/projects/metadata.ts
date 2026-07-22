import type { AiddExecutionMode, AiddTriumvirateRoles } from 'aidd-shared/execution-mode';
import type { ProjectStack } from 'aidd-shared/metadata/project-stack';

import type { DirectorPriorityHealth } from '../director.ts';
import type { MaturityBadge, MaturityDetail } from '../maturity.ts';
import type {
	ProjectArtifactCheckSummary,
	ProjectAssuranceProfile,
	ProjectInterviewProgress,
} from '../projects-profile.ts';
import type {
	FeatureStatusEntry,
	FeatureStats,
	FeatureSummary,
	ProjectFeature,
} from './features.ts';
import type { ProjectImplementationFeature } from './operations.ts';

export interface ProjectPorts {
	backendPort: null | number;
	frontendPort: null | number;
}

export interface ProjectMilestoneSummary {
	completed: number;
	total: number;
}

export interface ProjectRoadmapSummary {
	currentMilestone: null | string;
	invalidMappings: { featureDirectory: string; milestone: string }[];
	milestoneOrder: string[];
	milestones: Record<string, ProjectMilestoneSummary>;
	unmappedFeatureDirectories: string[];
}

export type ProjectSyncState = 'error' | 'idle' | 'syncing' | 'unknown';

/** Reflects the latest file-backed aidd metadata from `.aidd/runs.jsonl` and `.aidd/iterations`. */
export interface ProjectSyncStateInfo {
	lastSyncAt: null | string;
	lastSyncError: null | string;
	preferredCli: null | string;
	preferredModel: null | string;
	preferredProvider: null | string;
	preferredReasoningEffort: null | string;
	syncState: ProjectSyncState;
}

export type FinalCheckStatus = 'failed' | 'passed';

/**
 * Recorded results of the final acceptance checks an iteration ran (smoke:qc, typecheck,
 * build, format). A 'failed' entry means the gate failed even when the iteration exited 0 —
 * the UI surfaces that instead of reporting an unqualified success. Mirrors the backend
 * FinalCheckSummary DTO.
 */
export interface FinalCheckSummary {
	build?: FinalCheckStatus;
	format?: FinalCheckStatus;
	smokeQc?: FinalCheckStatus;
	typecheck?: FinalCheckStatus;
}

export interface ProjectLocalIteration {
	backend: null | string;
	completedFeatures: string[];
	completionMarkerIssue: null | string;
	durationMs: null | number;
	endedAt: null | string;
	executionMode: AiddExecutionMode | null;
	exitCode: null | number;
	finalChecks: FinalCheckSummary | null;
	iteration: null | number;
	runId: null | string;
	scopeOverrun: boolean;
	selectedFeatures: string[];
	startedAt: null | string;
	status: string;
	summary: null | string;
	triumvirateRoles: AiddTriumvirateRoles | null;
}

/**
 * A commit the CLI recorded for a run, mirrored from the backend GitCommitRefDto. The hash
 * stays a reachable ancestor of the branch, so it can be resolved into a diff on demand.
 */
export interface GitCommitRef {
	hash: string;
	subject: string;
}

export interface ProjectLocalRun {
	aiddDirty: boolean | null;
	aiddRevision: null | string;
	aiddVersion: null | string;
	aiSummary: null | string;
	artifactWarnings: string[];
	backend: null | string;
	/** Raw exit code of the run's last backend iteration, before orchestrator classification. */
	backendExitCode: null | number;
	/** Recorded commits, capped at 50 entries; commitsCreatedCount carries the true total. */
	commitsCreated: GitCommitRef[];
	commitsCreatedCount: number;
	completedFeatures: string[];
	durationMs: null | number;
	endedAt: null | string;
	executionMode: AiddExecutionMode | null;
	exitCode: null | number;
	filesCreated: number;
	filesEdited: number;
	mode: null | string;
	model: null | string;
	phase: null | string;
	provider: null | string;
	reasoningEffort: null | string;
	/** Source files (non-.aidd) left uncommitted at run end that were not dirty at run start —
	 * dirt the run itself introduced after its last commit (e.g. a post-commit formatter pass). */
	residualDirtySourceFiles: string[];
	residualUntrackedFeatureDirs: string[];
	runId: null | string;
	runLedgerDirty: boolean;
	scopeOverrun: boolean;
	source: null | string;
	startedAt: null | string;
	stopReason: null | string;
	summary: null | string;
	triumvirateRoles: AiddTriumvirateRoles | null;
}

export interface ProjectUsageTotals {
	cachedTokens: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	reportedCostUsd: number;
	runCount: number;
	runsWithReportedCost: number;
	runsWithTokenUsage: number;
	totalTokens: number;
}

export interface ProjectUsageExecutionTarget extends ProjectUsageTotals {
	backend: null | string;
	model: null | string;
	provider: null | string;
}

export interface ProjectUsageMode extends ProjectUsageTotals {
	mode: null | string;
}

export interface ProjectUsageSummary {
	byExecutionTarget: ProjectUsageExecutionTarget[];
	byMode: ProjectUsageMode[];
	totals: ProjectUsageTotals;
}

export type ProjectPhase = 'coding' | 'initializer' | 'onboarding';

export interface ProjectMetadata {
	addedAt: null | string;
	appVersion: null | string;
	artifactCheck: null | ProjectArtifactCheckSummary;
	interview: null | ProjectInterviewProgress;
	localIterations: ProjectLocalIteration[];
	localRuns: ProjectLocalRun[];
	maturity: MaturityBadge;
	phase?: ProjectPhase;
	ports: null | ProjectPorts;
	profile: ProjectAssuranceProfile;
	roadmap: null | ProjectRoadmapSummary;
	screenMapRouteCount: null | number;
	specUpdatedAt: null | string;
	stack: ProjectStack;
	sync: ProjectSyncStateInfo;
	templateVersion: null | string;
	testScenariosCount: null | number;
	usage: ProjectUsageSummary;
}

export interface ProjectActiveRunSummary {
	count: number;
	latestRunId: null | string;
}

export interface ProjectSummary {
	activeRuns: ProjectActiveRunSummary;
	artifactHealth: 'fresh' | 'missing' | 'stale' | 'unknown';
	featureStats: FeatureStats;
	featureStatus: FeatureStatusEntry[];
	featureSummary?: FeatureSummary;
	id: string;
	/** True when this project is a spernakit template checkout (hidden from the list by default). */
	isSpernakitTemplate?: boolean;
	metadata: Omit<ProjectMetadata, 'usage'> & {
		usage: Pick<ProjectMetadata['usage'], 'totals'>;
	};
	name: string;
	path: string;
	phase: ProjectPhase;
	priorityHealth: DirectorPriorityHealth;
	root: string;
	routeId: string;
}

export interface ProjectDetail extends ProjectSummary {
	artifactCheck?: unknown;
	features: ProjectFeature[];
	implementation: {
		blueprintReady: boolean;
		firstFeature: null | ProjectImplementationFeature;
		reason: null | string;
		state: 'blocked' | 'blueprint_ready' | 'building' | 'complete' | 'preparing';
	};
	maturityDetail: MaturityDetail;
	metadata: ProjectMetadata;
	roadmap?: unknown;
}
