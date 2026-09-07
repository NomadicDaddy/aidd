import type { FeatureLeaseService } from '../metadata/feature-leases.ts';
import type { AiddStore } from '../metadata/store.ts';
import type { AgentRunResult, StopReason } from '../orchestrator/result.ts';
import type { AiddMode, PromptPlan } from '../plan/types.ts';

export interface ModeContext {
	/** Cross-run feature lease coordinator, present on coding runs. Selection acquires a lease
	 * before claiming a feature and skips features leased by a concurrent live run against the
	 * same project (worktree or live-tree). */
	featureLeases?: FeatureLeaseService;
	/** Canonical project store for append-only lifecycle ledgers when `store` is worktree-rooted. */
	findingLedgerStore?: AiddStore;
	projectDir: string;
	rootDir?: string;
	runId?: string;
	scoringRoots?: readonly string[];
	store: AiddStore;
}

export interface SelectedWork {
	data?: unknown;
	description: string;
	id: string;
	kind?: 'feature' | 'generic' | 'none' | 'phase' | 'todo' | 'validation';
}

export interface ModeResult {
	artifacts?: Record<string, unknown>;
	complete: boolean;
	// A mode that has concluded the run can never succeed (e.g. the same work item failed
	// repeatedly with no way to make progress) sets fatal to end the run with a non-zero
	// classification instead of looping to max iterations and exiting 0. The orchestrator
	// finalizes the run with this exit code and stop reason immediately after the iteration.
	fatal?: { exitCode: number; stopReason?: StopReason };
	summary: string;
}

export interface ModeSummary {
	text: string;
}

export interface ModeHandler {
	buildPromptPlan(context: ModeContext, work: SelectedWork): Promise<PromptPlan>;
	isComplete(context: ModeContext, result: ModeResult): Promise<boolean>;
	readonly name: AiddMode;
	processResult(context: ModeContext, result: AgentRunResult): Promise<ModeResult>;
	selectWork(context: ModeContext): Promise<SelectedWork>;
	summarize(context: ModeContext, result: ModeResult): Promise<ModeSummary>;
}
