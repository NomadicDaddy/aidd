import type { BackendInputName, BackendName } from '../plan/types.ts';
import type { DirectorCycleAutoLaunch } from './director-auto-launch.ts';

export const directorTaskTypes = [
	'artifact_maintenance',
	'audit_backlog',
	'audit_maintenance',
	'audit_remediation',
	'ci_failure',
	'code_quality_trend',
	'dependency_hygiene',
	'drift_detection',
	'feature_completion',
	'pr_followup',
	'project_intake',
	'remediation_backlog',
	'smoke_test_failure',
	'stale_project',
	'unused_code',
] as const;

export const directorRiskLevels = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const directorChatRoles = ['assistant', 'system', 'user'] as const;
export const directorReasoningEfforts = [
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
] as const;

export type DirectorChatRole = (typeof directorChatRoles)[number];
export type DirectorReasoningEffort = (typeof directorReasoningEfforts)[number];
export type DirectorRiskLevel = (typeof directorRiskLevels)[number];
export type DirectorTaskType = (typeof directorTaskTypes)[number];

export interface DirectorSuggestion {
	confidence?: null | number;
	description: string;
	evidence: Record<string, unknown>;
	projectId: null | string;
	/**
	 * The rank `sortPrioritizedWork` assigned to the prioritized-work item this suggestion came
	 * from. Scoped to its cycle, never globally unique: two suggestions from different cycles may
	 * both be rank 1. Absent or null where there is no such ancestor — an aggregate rollup, or a
	 * model-authored suggestion with no priority backing — and never fabricated to fill the gap.
	 */
	rank?: null | number;
	reasoning: string;
	riskLevel: DirectorRiskLevel;
	suggestedArgs?: null | Record<string, string>;
	suggestedRecipe?: null | string;
	taskType: DirectorTaskType;
	title: string;
}

/**
 * What a suggestion is *about*: its project, its bucket, and the one artifact it targets.
 *
 * Include the targeted artifact identity (filterValue / feature) so multiple per-artifact
 * items in the same (project, taskType) bucket stay distinct, while true duplicates — the
 * same artifact, or the same aggregate bucket — collapse onto one key.
 *
 * Two callers depend on this being the same string: dedup below, and the rank stamp that
 * matches a suggestion back to the prioritized-work item it came from. Deriving it twice would
 * let them drift, and the drift would be silent — dedup would go on collapsing while every
 * rank quietly went null.
 */
export function suggestionTargetKey(target: {
	projectId: null | string;
	suggestedArgs?: null | Record<string, string>;
	taskType: string;
}): string {
	const artifact = target.suggestedArgs?.filterValue ?? target.suggestedArgs?.feature ?? '';
	return `${target.projectId ?? ''}\0${target.taskType}\0${artifact}`;
}

export function dedupDirectorSuggestions(suggestions: DirectorSuggestion[]): DirectorSuggestion[] {
	const seen = new Set<string>();
	const result: DirectorSuggestion[] = [];
	for (const suggestion of suggestions) {
		const key = suggestionTargetKey(suggestion);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(suggestion);
	}
	return result;
}

export interface DirectorOutput {
	fleetSummary: {
		byRisk: Record<DirectorRiskLevel, number>;
		byType: Partial<Record<DirectorTaskType, number>>;
		crossProjectPatterns: string[];
		fleetHealthScore?: number;
		totalSuggestions: number;
	};
	suggestions: DirectorSuggestion[];
}

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
	/** See `DirectorSuggestion.rank`. Null when nothing was recorded. */
	rank: null | number;
	reasoning: string;
	resolvedAt: null | number;
	riskLevel: DirectorRiskLevel;
	// 'launching' is a transient claim state: launchSuggestion atomically flips a pending
	// suggestion to 'launching' before starting work, then to 'launched' once the run or pipeline
	// exists (or back to 'pending' if launch fails), so concurrent launches cannot both spawn.
	status: 'dismissed' | 'launched' | 'launching' | 'pending';
	suggestedArgs: null | string;
	suggestedRecipe: null | string;
	taskType: DirectorTaskType;
	title: string;
}

/** The suggestion fields that feed the launch prompt. */
export type DirectorSuggestionPromptSource = Pick<
	DirectorSuggestionRecord,
	'description' | 'reasoning' | 'suggestedArgs' | 'suggestedRecipe' | 'title'
>;

/**
 * Composes the prompt sent to the fallback coding run for a suggestion without a recipe.
 * Shared so the web UI can preview exactly what that launch will send.
 */
export function buildSuggestionPrompt(suggestion: DirectorSuggestionPromptSource): string {
	const sections = [suggestion.title, suggestion.description, suggestion.reasoning];
	if (suggestion.suggestedRecipe)
		sections.push(`Suggested recipe: ${suggestion.suggestedRecipe}`);
	if (suggestion.suggestedArgs) sections.push(`Suggested args:\n${suggestion.suggestedArgs}`);
	return sections.join('\n\n');
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

export const chatAgentActionKinds = [
	'launch_run',
	'launch_suggestion',
	'dismiss_suggestion',
	'run_cycle',
	'stop_run',
	'kill_run',
	'file_edit',
	'query',
] as const;

export type ChatAgentActionKind = (typeof chatAgentActionKinds)[number];
export type ChatAgentActionStatus = 'error' | 'ok';

/**
 * One tool the agentic Director chat invoked during a turn, recorded for display and for the
 * action trail persisted on the assistant message. `summary` is human-readable; the optional ids
 * let the UI deep-link to the affected run/cycle/suggestion.
 */
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
