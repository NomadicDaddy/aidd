import type { BackendInputName } from 'aidd-shared/plan/types';

import { hasWallClockTimeoutMarker } from 'aidd-shared/runs/outcome';
import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type {
	RunContinuationReason,
	RunContinuationValue,
	RunLaunchRequest,
	WebRunStatus,
} from '../../types.ts';
import type { LedgerTerminalEntry } from './ledgerReconcile.ts';
import type { WebRunRow } from './queries.ts';

import { runs } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { readLedgerTerminalEntries } from './ledgerReconcile.ts';
import { getRun } from './queries.ts';
import { RunControlError, TERMINAL_STATUSES } from './types.ts';

// Guards the chain-depth walk against a corrupted chained_from cycle; real chains are bounded
// by web.autoChainLimit, which is far smaller.
const CHAIN_WALK_CEILING = 32;

/** The row/heartbeat facts continuation eligibility is decided from. */
export interface ContinuationRunFacts {
	mode: string;
	/** Runs spawned by a recipe step are owned by their pipeline session and never chain. */
	pipelineSessionId: null | string;
	status: string;
	stopReason: null | string;
	summary: null | string;
}

// Single continuation rule, shared by the live terminal transition, the ledger-drift sweep, and
// the on-demand check in continueRun. A run is continuation-eligible when it is a standalone
// coding run that ended for an environmental reason rather than a work outcome:
// - wall_clock_timeout: the orchestrator's summary marker (written only when the budget expired
//   with the selected feature incomplete) plus stopReason 'exit_error' — the stopReason gate
//   excludes merge-parked worktree runs, whose branch needs manual resolution before more work.
//   stopReason 'wall_clock_budget' is the graceful form of the same condition: the orchestrator
//   declined an iteration it could not finish before the deadline. It needs no marker (the stop
//   reason alone is unambiguous) and reports the same reason, because to the operator it is the
//   same situation — budget gone, work left.
// - initializer_handoff: an initializer-phase run completed cleanly; the first coding run still
//   needs a launch (the gap this feature exists to close).
export function evaluateContinuationValue(
	facts: ContinuationRunFacts,
	entry: LedgerTerminalEntry | undefined,
): RunContinuationValue {
	if (facts.mode !== 'coding') return 'none';
	if (facts.pipelineSessionId !== null) return 'none';
	const summary = facts.summary ?? entry?.summary;
	const stopReason = facts.stopReason ?? entry?.stopReason;
	const outOfBudget =
		stopReason === 'wall_clock_budget' ||
		(hasWallClockTimeoutMarker(summary) && stopReason === 'exit_error');
	if (outOfBudget) {
		const remaining = remainingSelectedFeatureCount(entry);
		// Unknown remaining work (no ledger line / pre-field line) still offers the follow-up: the
		// marker only appears when the selected feature did not complete, and a thin-budget stop
		// with nothing left simply chains into a run that ends as no_work.
		return remaining === null || remaining > 0 ? 'wall_clock_timeout' : 'none';
	}
	if (entry?.phase === 'initializer' && facts.status === 'completed') {
		return 'initializer_handoff';
	}
	return 'none';
}

function remainingSelectedFeatureCount(entry: LedgerTerminalEntry | undefined): null | number {
	if (!entry || entry.selectedFeatures === null) return null;
	const completed = new Set(entry.completedFeatures ?? []);
	return entry.selectedFeatures.filter((id) => !completed.has(id)).length;
}

// Ledger line for one run; absence (or an unreadable ledger) resolves to undefined.
export async function readContinuationLedgerEntry(
	projectPath: string,
	runId: string,
): Promise<LedgerTerminalEntry | undefined> {
	const entries = await readLedgerTerminalEntries(projectPath).catch(
		() => new Map<string, LedgerTerminalEntry>(),
	);
	return entries.get(runId);
}

// Continuation value for a terminal heartbeat record, shared by the live terminalize path and
// completed-CLI-run ingest. Decided BEFORE the terminal transaction (the CLI writes its ledger
// line ahead of the terminal heartbeat, so it is already on disk) and persisted atomically with
// the terminal status. Non-coding modes short-circuit without touching the filesystem; the
// pipeline-session gate for pre-existing rows lives inside the terminalizeRun command, the only
// place the session linkage is visible.
export async function resolveHeartbeatContinuationValue(
	record: {
		id: string;
		mode: string;
		projectPath: string;
		stopReason: null | string;
		summary: null | string;
	},
	finalStatus: WebRunStatus,
): Promise<RunContinuationValue> {
	if (record.mode !== 'coding') return 'none';
	const entry = await readContinuationLedgerEntry(record.projectPath, record.id);
	return evaluateContinuationValue(
		{
			mode: record.mode,
			pipelineSessionId: null,
			status: finalStatus,
			stopReason: record.stopReason,
			summary: record.summary,
		},
		entry,
	);
}

// Number of ancestors reachable through chained_from_run_id (the original run has depth 0).
export async function chainDepth(
	db: WebDatabase,
	run: { chainedFromRunId: null | string },
): Promise<number> {
	let depth = 0;
	const seen = new Set<string>();
	let parentId = run.chainedFromRunId;
	while (parentId !== null && !seen.has(parentId) && depth < CHAIN_WALK_CEILING) {
		seen.add(parentId);
		depth++;
		const parent = (
			await db
				.select({ chainedFromRunId: runs.chainedFromRunId })
				.from(runs)
				.where(eq(runs.id, parentId))
				.limit(1)
		)[0];
		parentId = parent?.chainedFromRunId ?? null;
	}
	return depth;
}

async function findFollowUpRunId(db: WebDatabase, runId: string): Promise<null | string> {
	const child = (
		await db.select({ id: runs.id }).from(runs).where(eq(runs.chainedFromRunId, runId)).limit(1)
	)[0];
	return child?.id ?? null;
}

// Same launch target, plain coding mode. Feature/filter flags from the original launch are
// intentionally not repeated: normal selection resumes the in_progress leftover first anyway,
// and reconstructing argv-only flags would be fragile.
export function buildContinuationLaunchRequest(
	run: Pick<WebRunRow, 'backend' | 'id' | 'model' | 'projectPath' | 'reasoningEffort'>,
): RunLaunchRequest {
	return {
		backend: run.backend as BackendInputName,
		chainedFromRunId: run.id,
		mode: 'coding',
		...(run.model !== null ? { model: run.model } : {}),
		projectDir: run.projectPath,
		...(run.reasoningEffort !== null ? { reasoningEffort: run.reasoningEffort } : {}),
	};
}

export interface ContinuationLaunchDeps {
	db: WebDatabase;
	launch(input: RunLaunchRequest): Promise<WebRunRow>;
	/** Telemetry start for the follow-up run (same shape as the direct launch route). */
	recordStart(run: WebRunRow): Promise<void>;
}

// One-click Continue: relaunch a continuation-eligible terminal run under its launch target.
export async function continueRun(deps: ContinuationLaunchDeps, runId: string): Promise<WebRunRow> {
	const row = await getRun(deps.db, runId);
	if (!row) throw new RunControlError('Run not found', 404);
	if (!TERMINAL_STATUSES.has(row.status as WebRunStatus)) {
		throw new RunControlError(
			'Run is still active; continuation applies to finished runs',
			409,
		);
	}
	const reason = await resolveRowContinuationReason(row);
	if (reason === null) {
		throw new RunControlError('Run is not continuation-eligible', 409);
	}
	const followUpId = await findFollowUpRunId(deps.db, runId);
	if (followUpId !== null) {
		throw new RunControlError(`Run already has a follow-up run (${followUpId})`, 409);
	}
	const launched = await deps.launch(buildContinuationLaunchRequest(row));
	await deps.recordStart(launched);
	return launched;
}

// Persisted value first; rows terminalized before the continuation column existed (NULL) are
// evaluated on demand from the ledger so old runs still support a manual Continue.
async function resolveRowContinuationReason(row: WebRunRow): Promise<null | RunContinuationReason> {
	const persisted = asContinuationReason(row.continuationReason);
	if (persisted !== null) return persisted;
	if (row.continuationReason !== null) return null; // evaluated as 'none'
	const entry = await readContinuationLedgerEntry(row.projectPath, row.id);
	return asContinuationReason(
		evaluateContinuationValue(
			{
				mode: row.mode,
				pipelineSessionId: row.pipelineSessionId,
				status: row.status,
				stopReason: row.stopReason,
				summary: row.summary,
			},
			entry,
		),
	);
}

export function asContinuationReason(value: null | string): null | RunContinuationReason {
	return value === 'initializer_handoff' || value === 'wall_clock_timeout' ? value : null;
}

export interface AutoChainDeps extends ContinuationLaunchDeps {
	autoChainLimit: number;
	autoChainRuns: boolean;
}

// Opt-in auto-chain, fired from the heartbeat terminal transition. Never throws: a skipped or
// failed chain must not disturb terminalization. CLI-launched rows are excluded — the panel
// should not silently spawn detached work the user started by hand in a terminal; the manual
// Continue affordance covers those.
export async function maybeAutoChainRun(
	deps: AutoChainDeps,
	runId: string,
	reason: RunContinuationReason,
): Promise<void> {
	try {
		if (!deps.autoChainRuns) return;
		// An initializer handoff represents a review boundary. It remains manually
		// continuable, but only an explicit Start building/Continue action may cross it.
		if (reason === 'initializer_handoff') return;
		const row = await getRun(deps.db, runId);
		if (!row || row.source === 'cli') return;
		const depth = await chainDepth(deps.db, row);
		if (depth >= deps.autoChainLimit) {
			webLogger.info(
				{ depth, limit: deps.autoChainLimit, reason, runId },
				'Auto-chain skipped: chain limit reached',
			);
			return;
		}
		if ((await findFollowUpRunId(deps.db, runId)) !== null) return;
		const launched = await deps.launch(buildContinuationLaunchRequest(row));
		await deps.recordStart(launched);
		webLogger.info({ followUpRunId: launched.id, reason, runId }, 'Auto-chained follow-up run');
	} catch (err) {
		// Concurrency-ceiling rejections and transient launch failures land here; the run row
		// keeps its continuation_reason, so the manual Continue affordance remains available.
		webLogger.warn({ err, reason, runId }, 'Auto-chain follow-up launch failed');
	}
}
