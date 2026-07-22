import { and, gte, inArray, isNull, or, sql } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { RunContinuationValue } from '../../types.ts';
import type { LedgerTerminalEntry } from './ledgerReconcile.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { evaluateContinuationValue } from './continuation.ts';
import { readLedgerTerminalEntries } from './ledgerReconcile.ts';
import { TERMINAL_STATUSES } from './types.ts';

const SWEEP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface SweepCandidate {
	continuationReason: null | string;
	mode: string;
	pipelineSessionId: null | string;
	status: string;
	stopReason: null | string;
	summary: null | string;
}

// Continuation value for a not-yet-evaluated row (NULL column). Row facts win; ledger facts
// fill their gaps (a user-stopped run's heartbeat could omit stopReason/summary). Rows already
// holding a value return null — nothing to fill.
function continuationFillFor(
	candidate: SweepCandidate,
	entry: LedgerTerminalEntry | undefined
): null | RunContinuationValue {
	if (candidate.continuationReason !== null) return null;
	return evaluateContinuationValue(
		{
			mode: candidate.mode,
			pipelineSessionId: candidate.pipelineSessionId,
			status: candidate.status,
			stopReason: candidate.stopReason ?? entry?.stopReason ?? null,
			summary: candidate.summary ?? entry?.summary ?? null,
		},
		entry
	);
}

/**
 * Backfill terminal `runs` rows whose exit_code/stop_reason are NULL from the project's
 * runs.jsonl ledger. The drift is systematic: a user-stopped run's terminal heartbeat can
 * lack those fields while the CLI's ledger line (written by writeRunSummary) carries them,
 * so the DB showed null exit/stop for runs the ledger fully described.
 *
 * Also evaluates continuation_reason for rows still NULL there (terminalized before the
 * continuation column existed, or force-failed by paths that skip evaluation), so the
 * Continue affordance converges for historical rows. 'none' is written for ineligible rows —
 * NULL strictly means "not yet evaluated" — which keeps each row a one-time candidate.
 *
 * Each row is repaired with a single atomic COALESCE update scoped to terminal statuses, so
 * a concurrent terminalization can never be overwritten (fill-NULL-only; status untouched).
 * The exit/stop field repair scans runs from the last 7 days each sweep — older rows either
 * got repaired already or have no ledger line to repair from. The continuation evaluation is
 * NOT windowed: rows terminalized before the continuation column existed are arbitrarily old,
 * and each is evaluated exactly once ('none' is written for ineligible rows, so a row never
 * re-enters the candidate set), which makes the unbounded scan self-draining.
 * @param db - Web database handle.
 * @returns The number of rows updated.
 */
export async function reconcileRunLedgerDrift(db: WebDatabase): Promise<number> {
	const cutoff = Date.now() - SWEEP_WINDOW_MS;
	const candidates = await db
		.select({
			continuationReason: runs.continuationReason,
			durationMs: runs.durationMs,
			exitCode: runs.exitCode,
			id: runs.id,
			mode: runs.mode,
			pipelineSessionId: runs.pipelineSessionId,
			projectPath: runs.projectPath,
			status: runs.status,
			stopReason: runs.stopReason,
			summary: runs.summary,
		})
		.from(runs)
		.where(
			and(
				inArray(runs.status, [...TERMINAL_STATUSES]),
				or(
					and(
						gte(runs.startedAt, cutoff),
						or(isNull(runs.exitCode), isNull(runs.stopReason))
					),
					isNull(runs.continuationReason)
				)
			)
		);
	if (candidates.length === 0) return 0;

	const byProject = new Map<string, (typeof candidates)[number][]>();
	for (const row of candidates) {
		const rows = byProject.get(row.projectPath) ?? [];
		rows.push(row);
		byProject.set(row.projectPath, rows);
	}

	let updated = 0;
	for (const [projectPath, candidateRows] of byProject) {
		let ledger: Map<string, LedgerTerminalEntry>;
		try {
			ledger = await readLedgerTerminalEntries(projectPath);
		} catch (err) {
			// An unreadable ledger is not an empty one: evaluating from row facts alone here
			// could finalize a reason the ledger line would have contradicted. Skip; retry next
			// sweep. A genuinely ledgerless project yields an empty map and proceeds — the
			// wall-clock continuation case is decidable from row facts alone.
			webLogger.warn({ err, projectPath }, 'Ledger-drift backfill: ledger read failed');
			continue;
		}
		for (const candidate of candidateRows) {
			const runId = candidate.id;
			const entry = ledger.get(runId);
			const continuationFill = continuationFillFor(candidate, entry);
			// A continuation evaluation is possible even without a ledger line (row facts alone
			// decide non-coding and wall-clock cases); the terminal-field fills still need one.
			if (!entry && continuationFill === null) continue;
			// Only update (and count) when something actually fills a currently-NULL field —
			// otherwise a row whose gaps the ledger shares would be re-reported as "repaired"
			// on every sweep.
			const fillsSomething =
				continuationFill !== null ||
				(entry !== undefined &&
					((candidate.exitCode === null && entry.exitCode !== null) ||
						(candidate.stopReason === null && entry.stopReason !== null) ||
						(candidate.summary === null && entry.summary !== null) ||
						(candidate.durationMs === null && entry.durationMs !== null)));
			if (!fillsSomething) continue;
			try {
				await withSqliteRetry(
					() =>
						db
							.update(runs)
							.set({
								continuationReason: sql`COALESCE(${runs.continuationReason}, ${continuationFill})`,
								durationMs: sql`COALESCE(${runs.durationMs}, ${entry?.durationMs ?? null})`,
								exitCode: sql`COALESCE(${runs.exitCode}, ${entry?.exitCode ?? null})`,
								stopReason: sql`COALESCE(${runs.stopReason}, ${entry?.stopReason ?? null})`,
								summary: sql`COALESCE(${runs.summary}, ${entry?.summary ?? null})`,
							})
							.where(
								and(
									sql`${runs.id} = ${runId}`,
									inArray(runs.status, [...TERMINAL_STATUSES])
								)
							),
					{ label: 'runs.ledgerDriftBackfill' }
				);
				updated++;
			} catch (err) {
				webLogger.warn({ err, runId }, 'Ledger-drift backfill: row update failed');
			}
		}
	}
	if (updated > 0) {
		webLogger.info(
			{ scanned: candidates.length, updated },
			'Backfilled run terminal fields from ledger'
		);
	}
	return updated;
}
