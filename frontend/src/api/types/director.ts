import type { ReasoningEffort } from './settings.ts';
import type { BackendInputName, BackendName } from './skills.ts';

export type DirectorChatRole = 'assistant' | 'system' | 'user';

export type DirectorReasoningEffort = ReasoningEffort;

export type DirectorRiskLevel = 'HIGH' | 'LOW' | 'MEDIUM';

export type DirectorSuggestionLaunch =
	{ kind: 'pipeline'; pipelineSessionId: string } | { kind: 'run'; runId: string };

export type DirectorTaskType =
	| 'artifact_maintenance'
	| 'audit_backlog'
	| 'audit_maintenance'
	| 'audit_remediation'
	| 'ci_failure'
	| 'code_quality_trend'
	| 'dependency_hygiene'
	| 'drift_detection'
	| 'feature_completion'
	| 'pr_followup'
	| 'project_intake'
	| 'remediation_backlog'
	| 'smoke_test_failure'
	| 'stale_project'
	| 'unused_code';

export interface DirectorSuggestionRecord {
	confidence: null | number;
	createdAt: number;
	cycleId: string;
	description: string;
	evidence: null | string;
	id: string;
	launchedPipelineSessionId: null | string;
	launchedRunId: null | string;
	projectId: null | string;
	/**
	 * The order the Director put this work in within its own cycle. Not globally unique, and
	 * null where no prioritized-work item produced the suggestion (an aggregate rollup, or a
	 * model-authored one) or where nothing was recorded.
	 */
	rank: null | number;
	reasoning: string;
	resolvedAt: null | number;
	riskLevel: DirectorRiskLevel;
	// 'launching' is a transient claim state set by launchSuggestion's compare-and-set guard
	// while a run is being spawned; it resolves to 'launched' (or back to 'pending' on failure).
	status: 'dismissed' | 'launched' | 'launching' | 'pending';
	suggestedArgs: null | string;
	suggestedRecipe: null | string;
	taskType: DirectorTaskType;
	title: string;
}

export type DirectorCycleStage =
	| 'completed'
	| 'failed'
	| 'persisting_results'
	| 'preparing_fleet_summary'
	| 'running_backend'
	| 'running_direct_ai'
	| 'starting'
	| 'writing_context';

export interface DirectorCycleArtifacts {
	contextExists: boolean;
	contextPath: string;
	fleetSummaryExists: boolean;
	fleetSummaryPath: string;
	outputExists: boolean;
	outputPath: string;
}

/** Direct AI provider/model metadata, present when a cycle uses the Direct AI fast path. */
export interface DirectAiMeta {
	model: string;
	provider: string;
	reasoningEffort: DirectorReasoningEffort;
}

/**
 * Why the auto-launcher passed over a suggestion. Mirrors the shared contract.
 */
export type DirectorAutoLaunchSkipCode =
	| 'active_run'
	| 'claim_lost'
	| 'dirty_tree'
	| 'launch_failed'
	| 'max_per_cycle'
	| 'project_unavailable'
	| 'rank_ineligible'
	| 'recipe_backed'
	| 'risk_above_ceiling';

/**
 * One thing a cycle started on its own: a single run, or a whole pipeline session when the
 * suggestion named a recipe the bounds allow. The two are followed to different pages, which is why
 * the summary discriminates on `kind` rather than guessing from which id is present.
 */
export type DirectorAutoLaunchLaunched =
	DirectorAutoLaunchLaunchedRun | DirectorAutoLaunchLaunchedSession;

export interface DirectorAutoLaunchLaunchedRun {
	kind: 'run';
	runId: string;
	suggestionId: string;
	title: string;
}

export interface DirectorAutoLaunchLaunchedSession {
	kind: 'pipeline';
	pipelineSessionId: string;
	suggestionId: string;
	title: string;
}

export interface DirectorAutoLaunchSkipped {
	code: DirectorAutoLaunchSkipCode;
	/** Human text naming the bound that stopped it, with the numbers that decided. */
	reason: string;
	suggestionId: string;
	title: string;
}

/**
 * What one cycle's auto-launcher did, and what it declined to do.
 *
 * Absent (null) means the cycle never reached the auto-launcher: it failed, it was a person
 * pressing Run cycle, or auto-launch is switched off. Present with two empty lists means it ran and
 * had nothing pending to consider.
 */
export interface DirectorCycleAutoLaunch {
	/** Set when the launcher could not finish at all, rather than deciding not to launch. */
	error?: string;
	launched: DirectorAutoLaunchLaunched[];
	skipped: DirectorAutoLaunchSkipped[];
}

export interface DirectorCycleRecord {
	artifacts: DirectorCycleArtifacts;
	/** What the cycle started on its own, and what it declined to; null when it never considered. */
	autoLaunch: DirectorCycleAutoLaunch | null;
	completedAt: null | number;
	/** Direct AI provider/model metadata, present when the cycle uses (or tried) the Direct AI path. */
	directAiMeta: DirectAiMeta | null;
	/** Human-readable reason a cycle failed; null for running/completed cycles. */
	failureReason: null | string;
	fleetHealthScore: null | number;
	id: string;
	stage: DirectorCycleStage;
	startedAt: number;
	status: 'completed' | 'failed' | 'running';
	totalSuggestions: number;
}

export interface DirectorProfileRecord {
	backend: BackendName;
	createdAt: number;
	id: string;
	instructions: string;
	model: null | string;
	reasoningEffort: DirectorReasoningEffort;
	role: string;
	updatedAt: number;
}

export interface DirectorProfileUpdate {
	backend?: BackendInputName;
	instructions?: string;
	model?: null | string;
	reasoningEffort?: DirectorReasoningEffort;
	role?: string;
}

export interface DirectorChatSessionRecord {
	createdAt: number;
	id: string;
	profileId: string;
	title: string;
	updatedAt: number;
}

export type ChatAgentActionKind =
	| 'dismiss_suggestion'
	| 'file_edit'
	| 'kill_run'
	| 'launch_run'
	| 'launch_suggestion'
	| 'query'
	| 'run_cycle'
	| 'stop_run';

export type ChatAgentActionStatus = 'error' | 'ok';

export interface ChatAgentAction {
	cycleId?: string;
	error?: string;
	kind: ChatAgentActionKind;
	mode?: string;
	path?: string;
	pipelineSessionId?: string;
	projectName?: string;
	runId?: string;
	status: ChatAgentActionStatus;
	suggestionId?: string;
	summary: string;
	tool: string;
}

export interface DirectorChatMessageRecord {
	actions: ChatAgentAction[];
	content: string;
	createdAt: number;
	cycleId: null | string;
	id: string;
	role: DirectorChatRole;
	sessionId: string;
}

export interface DirectorChatMessageInput {
	content: string;
}

export interface DirectorCycleInput {
	directive?: string;
	sessionId?: string;
}

export type DirectorPriorityTaskType =
	| 'artifact_maintenance'
	| 'audit_backlog'
	| 'audit_maintenance'
	| 'feature_completion'
	| 'project_intake'
	| 'remediation_backlog';

export type DirectorPriorityBucket =
	| 'artifact'
	| 'audit_backlog'
	| 'audit_stale'
	| 'feature_backlog'
	| 'healthy'
	| 'remediation_backlog';

export type DirectorHealthBand =
	| 'artifact_unhealthy'
	| 'audit_backlog'
	| 'audit_stale'
	| 'feature_backlog'
	| 'healthy'
	| 'remediation_backlog';

export interface DirectorPriorityHealth {
	band: DirectorHealthBand;
	primaryBucket: DirectorPriorityBucket;
	primaryTaskType: DirectorPriorityTaskType | null;
	reasons: string[];
	score: number;
}

export type SuggestionRecord = DirectorSuggestionRecord;

export type DirectorCycle = DirectorCycleRecord;

export type DirectorProfile = DirectorProfileRecord;

export type DirectorProfileInput = DirectorProfileUpdate;

export type DirectorChatSession = DirectorChatSessionRecord;

export type DirectorChatMessage = DirectorChatMessageRecord;

/**
 * What a person's **Launch** achieved. `claimedElsewhere` marks the race the Director's own
 * auto-launcher can win: the work is running, this click just did not start it, and the operator has
 * nothing to fix. `launch` is null only in the window before the winner records what it started.
 */
export interface OperatorLaunchOutcome {
	claimedElsewhere: boolean;
	launch: DirectorSuggestionLaunch | null;
}
