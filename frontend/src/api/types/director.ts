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

export interface DirectorCycleRecord {
	artifacts: DirectorCycleArtifacts;
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

export type DirectorPriorityTaskType =
	| 'artifact_maintenance'
	| 'audit_backlog'
	| 'audit_maintenance'
	| 'feature_completion'
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
