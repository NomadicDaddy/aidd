import type { AgentEvent, CLIBackend } from 'aidd-shared/backends/types';
import type { AiddStore } from 'aidd-shared/metadata/store';
import type { SelectedWork } from 'aidd-shared/modes/types';
import type { AgentRunResult, IterationMetrics } from 'aidd-shared/orchestrator/result';
import type { BackendName, RunPlan, TriumvirateRolePlan } from 'aidd-shared/plan/types';

export type BackendFactory = (name: BackendName) => CLIBackend;

export type TriumvirateStageName = 'execution' | 'overseer' | 'primary' | 'secondary';
export type TriumvirateCwdKind = 'planning_mirror' | 'project';

export interface TriumvirateStageArtifact {
	assistantText: string;
	backend: BackendName;
	completionCommittedDuringGrace?: boolean;
	completionFinalizedBeforeBackendExit?: boolean;
	cwdKind: TriumvirateCwdKind;
	durationMs: number;
	endedAt: string;
	exitCode: number;
	flailingDetected?: boolean;
	metrics: IterationMetrics;
	model?: string;
	planningMarkerRetry?: PlanningMarkerRetry;
	planningMirrorMutation?: PlanningMirrorMutation;
	planningMirrorRetry?: PlanningMirrorRetry;
	promptChars: number;
	role: TriumvirateStageName;
	selectedWork: Record<string, unknown>;
	stage: TriumvirateStageName;
	startedAt: string;
	structuredResult?: Record<string, unknown>;
	transcript: string;
	wallClockTimedOut?: boolean;
}

export type TriumvirateRunResult =
	| {
			artifact: Record<string, unknown>;
			completionCommittedDuringGrace: boolean;
			completionFinalizedBeforeBackendExit: boolean;
			metrics: IterationMetrics;
			result: AgentRunResult;
			status: 'executed';
			wallClockTimedOut?: boolean;
	  }
	| {
			artifact: Record<string, unknown>;
			metrics: IterationMetrics;
			result?: AgentRunResult;
			status: 'invalid';
			summary: string;
			wallClockTimedOut?: boolean;
	  }
	| {
			artifact: Record<string, unknown>;
			metrics: IterationMetrics;
			status: 'aborted';
			summary: string;
			wallClockTimedOut?: boolean;
	  };

export interface TriumvirateRunOptions {
	backendFactory: BackendFactory;
	compiledPrompt: string;
	completionMarkerGraceMs?: number;
	gitHeadBefore?: string;
	iteration?: number;
	onAgentEvent?: ((event: AgentEvent) => Promise<void> | void) | undefined;
	plan: RunPlan;
	runStartedAtMs?: number;
	/** Run-level abort signal, relayed into every stage's controller so a run-wide stop or
	 * abort ends the in-flight stage instead of only being noticed between iterations. */
	signal?: AbortSignal;
	store?: AiddStore;
	work: SelectedWork;
}

export interface StageRunResult {
	artifact: TriumvirateStageArtifact;
	completionCommittedDuringGrace: boolean;
	completionFinalizedBeforeBackendExit: boolean;
	flailingDetected: boolean;
	metrics: IterationMetrics;
	result: AgentRunResult;
	wallClockTimedOut: boolean;
}

export interface PlanningStageRunResult {
	metrics: IterationMetrics;
	result: StageRunResult;
	violation?: PlanningMirrorMutation;
}

export interface WorktreeSnapshot {
	available: boolean;
	status: string;
}

export interface PlanningMirrorSnapshot {
	files: Map<string, string>;
}

export interface PlanningMirrorMutation {
	changedPaths: string[];
	filesModifiedCount: number;
	role: TriumvirateStageName;
	stage: TriumvirateStageName;
	structuredResultEmitted: boolean;
}

export interface PlanningMirrorRetry {
	attempts: number;
	previousMutations: PlanningMirrorMutation[];
	reason: 'planning_mirror_mutation';
}

export interface PlanningMarkerRetry {
	attempts: number;
	reason: 'missing_plan_markdown';
}

export type OverseerDecision =
	| { consistencyIssues?: string[]; finalActions: string; status: 'execute' }
	| { reason: string; status: 'abort' }
	| { reason: string; status: 'invalid' };

export interface StageRunInput {
	backend: CLIBackend;
	completion?: {
		gitHeadBefore?: string;
		graceMs: number;
		store: AiddStore;
	};
	cwd: string;
	cwdKind: TriumvirateCwdKind;
	iteration?: number;
	onAgentEvent?: (event: AgentEvent) => Promise<void> | void;
	plan: RunPlan;
	prompt: string;
	role: TriumvirateRolePlan;
	runStartedAtMs?: number;
	signal?: AbortSignal;
	stage: TriumvirateStageName;
	work: SelectedWork;
}

export const mirrorExclusions = new Set([
	'.cache',
	'.git',
	'.next',
	'.turbo',
	'.vite',
	'build',
	'coverage',
	'data',
	'dist',
	'node_modules',
]);
export const retryPromptChangedPathLimit = 100;
export const originalWorktreeGuardIgnoredPaths = new Set([
	'.aidd/findings-ledger.jsonl',
	'.aidd/runs.jsonl',
]);

export const emptyMetrics: IterationMetrics = {
	cachedTokens: 0,
	costUsd: 0,
	errorCount: 0,
	errorReasons: [],
	filesCreatedCount: 0,
	filesEditedCount: 0,
	idleWarningCount: 0,
	inputTokens: 0,
	outputTokens: 0,
	rateLimitCount: 0,
	reasoningTokens: 0,
	toolBreakdown: {},
	toolCallCount: 0,
};
