import type { ProjectAssuranceProfile } from 'aidd-shared';
import type { AiddExecutionMode, AiddTriumvirateRoles } from 'aidd-shared/execution-mode';
import type { ProjectStack } from 'aidd-shared/metadata/project-stack';

import type { MaturityBadgeDto } from '../maturity.ts';

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

export interface ProjectInterviewProgress {
	answered: number;
	total: number;
}

export interface ProjectInterviewQuestionDto {
	id: string;
	priority: string;
	prompt: string;
	response?: string;
}

export type AnsweredInterviewQuestionDto = { response: string } & ProjectInterviewQuestionDto;

export interface ProjectInterviewDetailDto {
	answered: number;
	answeredQuestions: AnsweredInterviewQuestionDto[];
	hasQuestionsFile: boolean;
	total: number;
	unanswered: ProjectInterviewQuestionDto[];
}

export interface ProjectArtifactCheckCounts {
	fresh: number;
	missing: number;
	present: number;
	requiredMissing: number;
	stale: number;
	total: number;
}

export type ProjectArtifactSeverity = 'optional' | 'recommended' | 'required';

export type ProjectArtifactFreshness = 'fresh' | 'missing' | 'stale';

export interface ProjectArtifactRecord {
	ageDays: null | number;
	exists: boolean;
	freshness: ProjectArtifactFreshness;
	label: string;
	mtime: null | string;
	path: string;
	severity: ProjectArtifactSeverity;
	sizeBytes: number;
}

export interface ProjectArtifactCheckSummary {
	artifacts: ProjectArtifactRecord[];
	checkedAt: string;
	staleThresholdDays: number;
	summary: ProjectArtifactCheckCounts;
}

export type ProjectSyncState = 'error' | 'idle' | 'syncing' | 'unknown';

export interface ProjectSyncStateDto {
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
 * build, format). Mirrors the CLI's FinalCheckSummary written into the iteration artifact's
 * detailsSummary.finalChecks. A 'failed' entry means the gate failed even when the iteration
 * exited 0 — the UI must surface that rather than report an unqualified success.
 */
export interface FinalCheckSummary {
	build?: FinalCheckStatus;
	format?: FinalCheckStatus;
	smokeQc?: FinalCheckStatus;
	typecheck?: FinalCheckStatus;
}

export interface ProjectLocalIterationDto {
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
 * A commit the CLI recorded for a run. Mirrors the orchestrator's GitCommitSummary written
 * into runs.jsonl `commitsCreated`; the recorded hash stays a reachable ancestor of the
 * branch (the CLI never amends it), so it can be resolved with `git show` later.
 */
export interface GitCommitRefDto {
	hash: string;
	subject: string;
}

export interface ProjectLocalRunDto {
	aiddDirty: boolean | null;
	aiddRevision: null | string;
	aiddVersion: null | string;
	aiSummary: null | string;
	artifactWarnings: string[];
	backend: null | string;
	/** Raw exit code of the run's last backend iteration, before orchestrator classification. */
	backendExitCode: null | number;
	/** Recorded commits, capped at 50 entries; commitsCreatedCount carries the true total. */
	commitsCreated: GitCommitRefDto[];
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
	/** Source paths that became dirty during the run without matching run-recorded evidence. */
	unattributedDirtySourceFiles: string[];
}

export interface ProjectUsageTotalsDto {
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

export interface ProjectUsageDailyTokensDto {
	date: string;
	totalTokens: number;
}

export interface ProjectUsageExecutionTargetDto extends ProjectUsageTotalsDto {
	backend: null | string;
	model: null | string;
	provider: null | string;
}

export interface ProjectUsageModeDto extends ProjectUsageTotalsDto {
	mode: null | string;
}

export interface ProjectUsageSummaryDto {
	byExecutionTarget: ProjectUsageExecutionTargetDto[];
	byMode: ProjectUsageModeDto[];
	recentDailyTokens: ProjectUsageDailyTokensDto[];
	totals: ProjectUsageTotalsDto;
}

export interface ProjectMetadataDto {
	addedAt: null | string;
	appVersion: null | string;
	artifactCheck: null | ProjectArtifactCheckSummary;
	interview: null | ProjectInterviewProgress;
	localIterations: ProjectLocalIterationDto[];
	localRuns: ProjectLocalRunDto[];
	maturity: MaturityBadgeDto;
	phase?: 'coding' | 'initializer' | 'onboarding';
	ports: null | ProjectPorts;
	profile: ProjectAssuranceProfile;
	roadmap: null | ProjectRoadmapSummary;
	screenMapRouteCount: null | number;
	specUpdatedAt: null | string;
	stack: ProjectStack;
	sync: ProjectSyncStateDto;
	templateVersion: null | string;
	testScenariosCount: null | number;
	usage: ProjectUsageSummaryDto;
}
