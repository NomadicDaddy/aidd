import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { randomUUID } from 'node:crypto';

import type { PreRunCheckResult } from './run-gates.ts';
import type { OrchestratorDeps } from './types.ts';

import { initialRunTotals, runRuntimeFields } from './types.ts';

export async function finalizePreRunCheck(
	deps: OrchestratorDeps,
	plan: RunPlan,
	result: PreRunCheckResult,
): Promise<void> {
	const runId = deps.runId ?? randomUUID();
	const endedAtMs = Date.now();
	const totals = {
		...initialRunTotals,
		errors: result.exitCode === orchestratorExitCodes.success ? 0 : 1,
	};
	// Append a ledger line so the "every terminal run has a ledger entry" invariant includes
	// --check-features and --check-artifacts runs and Recent Runs can retain them.
	await deps.store.appendRunSummary({
		...(deps.aiddProvenance ?? {
			aiddDirty: null,
			aiddRevision: null,
			aiddVersion: null,
		}),
		aiSummary: null,
		durationMs: 0,
		endedAt: new Date(endedAtMs).toISOString(),
		runId,
		startedAt: new Date(endedAtMs).toISOString(),
		...runRuntimeFields(plan),
		backendExitCode: null,
		commitsCreated: [],
		completedFeatures: [],
		diffStat: null,
		exitCode: result.exitCode,
		fileChangePathsTruncated: false,
		filesCreated: [],
		filesEdited: [],
		runLedgerDirty: false,
		scopeOverrun: false,
		selectedFeatures: [],
		source: deps.source ?? 'cli',
		stopReason: result.stopReason,
		summary: result.summary,
		toolBreakdown: {},
		totals,
	});
	await deps.observer?.onFinalSummary?.({
		aiSummary: null,
		backendExitCode: null,
		commitsCreated: [],
		completedFeatures: [],
		diffStat: null,
		exitCode: result.exitCode,
		fileChangePathsTruncated: false,
		filesCreated: [],
		filesEdited: [],
		runId,
		runLedgerDirty: false,
		scopeOverrun: false,
		selectedFeatures: [],
		stopReason: result.stopReason,
		summary: result.summary,
		totals,
	});
}
