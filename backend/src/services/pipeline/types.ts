import type { RunInitiator } from 'aidd-shared/metadata/active-runs';
import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import type { pipelineSessions, pipelineStepResults } from '../../db/schema.ts';
import type { PipelineActiveTopLevelStep, PipelineStepStatus, WebRunStatus } from '../../types.ts';
import type { RunService } from '../runService.ts';
import type { TelemetryInvocationSource } from '../telemetry/types.ts';

export interface LaunchPipelineInput {
	/**
	 * Who is starting this session, and therefore what every run it spawns records.
	 *
	 * Required, and deliberately not derived from `source`: a Run now on a scheduled recipe task
	 * arrives here with source 'scheduled' and a person standing in front of it. Making the
	 * compiler ask at each call site is the point — a default would pick one answer for every
	 * future launch path, and the wrong pick files somebody's work as aidd's.
	 */
	initiator: RunInitiator;
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
	scheduledTaskExecutionId?: string | undefined;
	source?: Extract<TelemetryInvocationSource, 'scheduled' | 'web'> | undefined;
}

export interface ExecutionContext {
	depth: number;
	displayOrder: number;
	/** Carried, not recomputed: `source` cannot tell Run now apart from the timer firing. */
	initiator: RunInitiator;
	invocationId?: string | undefined;
	launchTarget?: LaunchTargetOverrides | undefined;
	lineage: string[];
	metadataOnly?: boolean | undefined;
	parameters: Record<string, string>;
	// Output summary of the step that ran immediately before this one, at the same recipe level.
	// Recipes chain review -> remediate: the remediation step is a fresh CLI run with no memory of
	// the review, so without this it has to rediscover findings it was told to act on. Forwarded
	// only into steps that opt in with `includePriorStepOutput`.
	priorStepOutput?: { stepName: string; text: string } | undefined;
	projectDir: string;
	scheduledTaskExecutionId?: string | undefined;
	sessionId: string;
	source?: Extract<TelemetryInvocationSource, 'scheduled' | 'web'> | undefined;
}

export interface StepDispatchResult {
	/**
	 * The run's closing assistant message, when the step produced one. Distinct from
	 * outputSummary, which is a raw transcript tail kept for the console: this is the report the
	 * next step is meant to act on, so it is what gets forwarded into a downstream prompt.
	 */
	agentMessage?: string | undefined;
	errorMessage?: string | undefined;
	exitCode?: number | undefined;
	ok: boolean;
	outputSummary?: string | undefined;
}

export interface StepExecutionResult {
	agentMessage?: string | undefined;
	errorMessage?: string | undefined;
	ok: boolean;
	outputSummary?: string | undefined;
	stopped: boolean;
}

export type PipelineSessionRow = typeof pipelineSessions.$inferSelect;
export type PipelineStepResultRow = typeof pipelineStepResults.$inferSelect;
export type RunRow = NonNullable<Awaited<ReturnType<RunService['getRun']>>>;

export interface PipelineTopLevelProgress {
	activeTopLevelStep: null | PipelineActiveTopLevelStep;
	completedTopLevelSteps: number;
}

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
interface ResumeStepBase {
	// Pre-existing pipeline_step_results.id for the step that was running at shutdown.
	// Nested recipe frames retain their own wrapper row, so recovery can unwind the
	// persisted execution tree without inserting duplicate steps.
	resultId: string;
	runId: null | string;
	sequenceNumber: number;
	startedAt: null | number;
	stepIndex: number;
	stepType: string;
}

export interface ResumeLeafStep extends ResumeStepBase {
	// 're-attach' = step was a managed run (aidd-cli/skill) whose run row
	// still has a non-terminal status (or is terminal and will be picked up on the
	// next poll). The resume path awaits the runId via RunWaiter, then continues.
	// 'fail' = step cannot survive web restart (shell command, hook, or a managed
	// run whose row disappeared). Resume marks the step failed and applies the
	// step's onFailure policy.
	action: 'fail' | 're-attach';
	failReason?: string;
}

export interface ResumeRecipeRefStep extends ResumeStepBase {
	action: 'resume-recipe';
	// Active direct child, if one existed at shutdown. A recipe-ref may instead have
	// completed children and be between child steps; childStartSequenceNumber resumes
	// from the first child sequence not already persisted.
	child?: ResumeInFlightStep;
	childStartSequenceNumber: number;
	previousChildResult?: {
		errorMessage?: string;
		sequenceNumber: number;
		status: PipelineStepStatus;
	};
}

export type ResumeInFlightStep = ResumeLeafStep | ResumeRecipeRefStep;

export interface ResumeResolution {
	displayOrder: number;
	inFlightStep?: ResumeInFlightStep;
	// 1-based sequence number to begin/continue executeRecipeSteps from. If an
	// in-flight step is present, this is its sequenceNumber and the executor handles
	// it via the in-flight path before continuing. Otherwise it is the next index.
	startSequenceNumber: number;
}
