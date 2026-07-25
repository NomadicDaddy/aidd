import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import type { pipelineSessions, pipelineStepResults } from '../../db/schema.ts';
import type { WebRunStatus } from '../../types.ts';
import type { RunService } from '../runService.ts';

export interface LaunchPipelineInput {
	// Session-level backend/model/effort override chosen at launch time. Wins over
	// per-step config (the visible at-launch choice must not be silently beaten by
	// buried step config); unset fields resolve from step config, then project/global
	// config. Persisted on the session row so resumes keep it.
	launchTarget?: LaunchTargetOverrides | undefined;
	// When true, every step in the session (including nested recipe-ref children) is
	// verified against a `.aidd/`-only write boundary after it completes. Phase 1 of
	// the Project Intake plan: detection via git-porcelain diff; the CLI-level hard
	// guard lands separately.
	metadataOnly?: boolean | undefined;
	parameters?: Record<string, string> | undefined;
	projectDir: string;
	recipeId: string;
}

export interface ExecutionContext {
	depth: number;
	displayOrder: number;
	invocationId?: string | undefined;
	launchTarget?: LaunchTargetOverrides | undefined;
	lineage: string[];
	metadataOnly?: boolean | undefined;
	parameters: Record<string, string>;
	projectDir: string;
	sessionId: string;
}

export interface StepDispatchResult {
	errorMessage?: string | undefined;
	exitCode?: number | undefined;
	ok: boolean;
	outputSummary?: string | undefined;
}

export interface StepExecutionResult {
	errorMessage?: string | undefined;
	ok: boolean;
	stopped: boolean;
}

export type PipelineSessionRow = typeof pipelineSessions.$inferSelect;
export type PipelineStepResultRow = typeof pipelineStepResults.$inferSelect;
export type RunRow = NonNullable<Awaited<ReturnType<RunService['getRun']>>>;

export const terminalRunStatuses = new Set<WebRunStatus>([
	'completed',
	'failed',
	'killed',
	'stopped',
]);
export const managedStepTypes = new Set(['aidd-cli', 'skill']);
export const maxRecipeDepth = 5;

// Outcome of inspecting a 'running'/'queued' pipeline_sessions row at startup. Returned
// by SessionLifecycle.classifyForResume() and consumed by LaunchService.resumeSession()
// so the orchestration loop can pick up where it left off without re-doing work that
// has already been persisted (and without abandoning detached managed-step runs that
// are still alive thanks to the run heartbeat infrastructure).
export interface ResumeInFlightStep {
	// 're-attach' = step was a managed run (aidd-cli/skill) whose run row
	// still has a non-terminal status (or is terminal and will be picked up on the
	// next poll). The resume path awaits the runId via RunWaiter, then continues.
	// 'fail' = step cannot survive web restart (shell command, hook, or a managed
	// run whose row disappeared). Resume marks the step failed and applies the
	// step's onFailure policy.
	action: 'fail' | 're-attach';
	failReason?: string;
	// Pre-existing pipeline_step_results.id for the top-level step that was running at
	// shutdown. Resolved during resume rather than fabricated from scratch so the row's
	// history is preserved instead of being replaced.
	resultId: string;
	runId: null | string;
	sequenceNumber: number;
	startedAt: null | number;
	stepIndex: number;
	stepType: string;
}

export interface ResumeResolution {
	displayOrder: number;
	inFlightStep?: ResumeInFlightStep;
	// 1-based sequence number to begin/continue executeRecipeSteps from. If an
	// in-flight step is present, this is its sequenceNumber and the executor handles
	// it via the in-flight path before continuing. Otherwise it is the next index.
	startSequenceNumber: number;
}
