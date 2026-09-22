import type { AgentEvent, CLIBackend } from 'aidd-shared/backends/types';
import type { CliActiveRunSource } from 'aidd-shared/metadata/active-runs';
import type { FeatureLeaseService } from 'aidd-shared/metadata/feature-leases';
import type { AiddStore, FeatureReadFailure } from 'aidd-shared/metadata/store';
import type { ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { AgentRunResult, IterationMetrics, StopReason } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';
import type { AiddRunDriver, AiddRunProvenance } from 'aidd-shared/run-provenance';

import { aiddExecutionModes } from 'aidd-shared/execution-mode';

import type { createModeHandler } from '../../modes/factory.ts';
import type { CompiledPrompt } from '../../prompts/types.ts';
import type { IterationDetails } from '../details.ts';
import type { OrchestratorProgressReporter } from '../progress.ts';
import type { OrchestratorState } from '../state.ts';
import type { BackendFactory } from '../triumvirate.ts';
import type { extractTriumviratePlanningRecovery } from '../triumvirate/planning-recovery.ts';
import type { RunAiSummarizer } from './ai-summary.ts';
import type { DoctorProber } from './doctor.ts';
import type { WorktreeFinalization } from './worktree-evidence.ts';

export interface OrchestratorDeps {
	aiddProvenance?: AiddRunProvenance;
	aiSummarizer?: RunAiSummarizer;
	backend: CLIBackend;
	backendFactory?: BackendFactory;
	completionMarkerGraceMs?: number;
	/** Test seam for the preflight doctor's spawn probes. */
	doctorProber?: DoctorProber;
	/** Cross-run feature lease coordinator, injected by the CLI entrypoint for coding runs.
	 * Selection acquires leases (skipping features held by concurrent live runs) and the
	 * terminal writeRunSummary releases everything this run holds — completion, failure, and
	 * parking all funnel through it. Hard deaths skip release; the web orphan reap deletes a
	 * dead run's leases alongside its worktree. */
	featureLeases?: FeatureLeaseService;
	/** Worktree finalization hook, injected by the CLI entrypoint. Called once at run end with
	 * the orchestrator's exit code; persists run evidence canonically, merges/discards the
	 * worktree, applies the metadata delta on a landed merge, and reports the outcome (including
	 * an exit-code override when a successful run's merge is parked). Threaded through
	 * writeRunSummary so the parked outcome lands in the ledger AND terminal heartbeat — never
	 * the pre-merge success. */
	finalizeWorktree?: (exitCode: number) => Promise<WorktreeFinalization>;
	/** Canonical (live-tree) store that receives the run ledger entry when `store` is rooted in
	 * a throwaway worktree — a line appended to the worktree's gitignored `.aidd` would be
	 * destroyed with it. Absent for non-worktree runs (`store` is already canonical). */
	ledgerStore?: AiddStore;
	observer?: RunObserver;
	onState?: (state: OrchestratorState) => void;
	rootDir: string;
	runId?: string;
	scoringRoots?: readonly string[];
	source?: CliActiveRunSource;
	store: AiddStore;
}

export interface RunIterationArtifact {
	log: string;
	structured: Record<string, unknown>;
}

export interface RunFinalSummary {
	aiSummary: null | string;
	/** Raw exit code of the last backend iteration; null when no iteration ran. */
	backendExitCode: null | number;
	commitsCreated: GitCommitSummary[];
	completedFeatures: string[];
	/** Git numstat over the attributed commits; null when the run produced no commits or the
	 * stat could not be derived. */
	diffStat: CommitDiffStat | null;
	driverId?: AiddRunDriver['driverId'];
	driverKind?: AiddRunDriver['driverKind'];
	driverSha256?: AiddRunDriver['driverSha256'];
	exitCode: number;
	fileChangePathsTruncated: boolean;
	filesCreated: string[];
	filesEdited: string[];
	runId: string;
	runLedgerDirty: boolean;
	scopeOverrun: boolean;
	selectedFeatures: string[];
	stopReason: StopReason;
	summary: string;
	totals: typeof initialRunTotals;
}

export interface RunObserver {
	onAgentEvent?: (event: AgentEvent) => Promise<void> | void;
	onFinalSummary?: (summary: RunFinalSummary) => Promise<void> | void;
	onIteration?: (artifact: RunIterationArtifact) => Promise<void> | void;
	onModeResult?: (result: ModeResult) => Promise<void> | void;
	onState?: (state: OrchestratorState) => void;
}

export interface GitCommitSummary {
	hash: string;
	subject: string;
}

export interface CommitDiffStat {
	deletions: number;
	filesChanged: number;
	insertions: number;
}

export interface FeatureCompletionSnapshot {
	/** Feature directory (or id) → whether it read as completed+passing at capture time. */
	completed: Map<string, boolean>;
	/** Records that exist on disk but would not parse, so they are absent from `completed`
	 * entirely. Tracked separately because "unreadable" must never be scored as "not completed":
	 * repairing such a file makes the feature reappear, which the scope audit would otherwise read
	 * as the agent completing something it was never assigned. */
	unreadable: FeatureReadFailure[];
}

export const initialRunTotals = {
	cachedTokens: 0,
	commitsCreated: 0,
	costUsd: 0,
	errors: 0,
	filesCreated: 0,
	filesEdited: 0,
	idleWarnings: 0,
	inputTokens: 0,
	iterations: 0,
	outputTokens: 0,
	rateLimits: 0,
	reasoningTokens: 0,
	toolCalls: 0,
};

export interface RunAccumulator {
	/** Findings per audit name from every audit iteration, written to the run ledger entry so the
	 * scorer credits each audit in a batch with its own count rather than the batch total. */
	auditFindings: Record<string, number>;
	/** Shell commands recorded from this run's tool events. Run-end dirty-source accounting uses
	 * exact path mentions in these commands as attribution evidence without widening completion
	 * recovery's stricter auto-commit rules. */
	commandsRun: Set<string>;
	commitsCreated: GitCommitSummary[];
	completedFeatures: Set<string>;
	/** Feature records this run deleted while another LIVE run held their lease. Recorded on the
	 * accumulator rather than only as a carryover note because the offending run is usually a
	 * single-iteration directive: it never compiles another prompt, so the note is never drained
	 * and the run would otherwise finalize with no trace of the damage (writeRunSummary). */
	destroyedLeasedFeatures: { featureId: string; runId: string }[];
	/** Dirty `.aidd` paths present when the run started: the operator's, not the run's. Run end
	 * commits the metadata aidd wrote after the agent's last commit, and diffs against this so an
	 * operator edit made while the run was going is never swept into that commit. */
	dirtyMetadataPathsAtStart?: ReadonlySet<string>;
	/** Dirty non-.aidd paths present when the run started. writeRunSummary diffs run-end status
	 * against this baseline before classifying newly dirty paths by run evidence. Undefined when
	 * the baseline could not be captured (not a git repository); the run-end check is then skipped
	 * rather than misattributing existing dirt to the run. */
	dirtySourcePathsAtStart?: ReadonlySet<string>;
	filesCreated: Set<string>;
	filesEdited: Set<string>;
	forcedAttributionCommits: Set<string>;
	/** Wall-clock duration of each completed iteration, in start order. The loop-top budget guard
	 * takes their median as its estimate of what the next iteration will cost, so it can decline to
	 * dispatch one that cannot finish before the deadline. */
	iterationDurationsMs: number[];
	/** Raw exit code of the last backend iteration, before orchestrator classification.
	 * Persisted to the ledger as backendExitCode so log/summary/ledger stay reconcilable. */
	lastBackendExitCode?: number;
	/** Corrective notes raised by the post-iteration guards, drained into the next iteration's
	 * prompt alongside the flailing nudge. A guard that ends the iteration instead of the run
	 * still has to tell the agent what went wrong, or the next iteration repeats it. */
	pendingCarryoverNotes: string[];
	runId: string;
	runStartedAt: string;
	runStartedAtMs: number;
	runTotals: typeof initialRunTotals;
	scopeOverrun: boolean;
	/** How many iterations completed a feature outside their allowed set. The first is corrected
	 * in-flight; a repeat means the boundary is not being respected and ends the run. */
	scopeOverrunIterations: number;
	selectedFeatures: Set<string>;
	toolBreakdownTotals: Record<string, number>;
}

export type MoveFn = (state: OrchestratorState) => void;

export interface FeatureScopeAudit {
	allowedFeatureIds: string[];
	completedFeatures: string[];
	completionMarkerIssue: 'completion_marker_missing_or_unaccepted' | undefined;
	extraCompletedFeatures: string[];
	/** Feature records that would not parse when the iteration ended. Corruption here is silent
	 * data loss — the feature vanishes from every listing — so it is reported, not tolerated. */
	invalidFeatureMetadata: FeatureReadFailure[];
	scopeOverrun: boolean;
	selectedFeatures: string[];
	unacceptedCompletedFeatures: string[];
}

export function runRuntimeFields(plan: RunPlan): Record<string, unknown> {
	return {
		backend: plan.backend,
		driverId: plan.driver?.driverId ?? null,
		driverKind: plan.driver?.driverKind ?? null,
		driverSha256: plan.driver?.driverSha256 ?? null,
		executionMode: plan.triumvirate
			? aiddExecutionModes.triumvirate
			: aiddExecutionModes.singleAgent,
		mode: plan.mode,
		model: plan.model ?? null,
		phase: plan.prompt.phase,
		provider: plan.provider ?? null,
		reasoningEffort: plan.reasoningEffort,
		...(plan.triumvirate ? { triumvirateRoles: plan.triumvirate } : {}),
		...(plan.thinking !== undefined ? { thinking: plan.thinking } : {}),
		...(plan.thinkingLevel !== undefined ? { thinkingLevel: plan.thinkingLevel } : {}),
	};
}

export interface FinalizeIterationInput {
	acc: RunAccumulator;
	activeProgress: OrchestratorProgressReporter | undefined;
	compiled: CompiledPrompt;
	completionCommittedDuringGrace: boolean;
	completionFinalizedBeforeBackendExit: boolean;
	context: {
		projectDir: string;
		rootDir: string;
		scoringRoots?: readonly string[];
		store: AiddStore;
	};
	deps: OrchestratorDeps;
	events: AgentEvent[];
	exitCode: number;
	featureSnapshotBefore: FeatureCompletionSnapshot;
	gitHeadBefore: string | undefined;
	idleWarningTimestamps: { afterMs: number; atMs: number }[];
	iteration: number;
	iterationArtifactIndex: number;
	metrics: IterationMetrics;
	mode: ReturnType<typeof createModeHandler>;
	move: MoveFn;
	plan: RunPlan;
	result: AgentRunResult;
	runStartedAtMs: number;
	startedAt: string;
	startedAtMs: number;
	stopRequestedAfterRun: boolean;
	timeToFirstEventMs: number | undefined;
	triumvirateArtifacts: Record<string, unknown>;
	work: SelectedWork;
}

export interface FinalizeIterationResult {
	completedAfterBackendInterruption: boolean;
	completedResultFeature: string | undefined;
	details: IterationDetails;
	displayedSummary: string;
	featureScope: FeatureScopeAudit;
	modeResult: ModeResult;
	planningRecovery: ReturnType<typeof extractTriumviratePlanningRecovery>;
	recordedExitCode: number;
	recoveredActiveVerification: boolean;
}
