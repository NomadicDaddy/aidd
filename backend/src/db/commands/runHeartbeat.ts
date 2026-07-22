import type { CliActiveRunRecord } from 'aidd-shared/metadata/active-runs';

import { eq } from 'drizzle-orm';

import type { WebRunStatus } from '../../types.ts';
import type {
	HeartbeatWriteOutcome,
	LocalTransaction,
	MarkRunStaleArgs,
	ReconcileDeadRunArgs,
	TerminalizeRunArgs,
} from './types.ts';

import { TERMINAL_STATUSES } from '../../services/run/types.ts';
import { runs } from '../schema.ts';

function commandArgsJson(record: CliActiveRunRecord): null | string {
	return record.commandArgs && record.commandArgs.length > 0
		? JSON.stringify(record.commandArgs)
		: null;
}

// Terminal output metrics from the CLI heartbeat record. Null-safe by construction: records
// from older CLI versions parse these to null, which persists as NULL ("not captured").
function outputMetricValues(record: CliActiveRunRecord) {
	return {
		cachedTokens: record.cachedTokens,
		filesChanged: record.filesChanged,
		inputTokens: record.inputTokens,
		linesAdded: record.linesAdded,
		linesRemoved: record.linesRemoved,
		outputTokens: record.outputTokens,
		reasoningTokens: record.reasoningTokens,
	};
}

function provenanceValues(record: CliActiveRunRecord) {
	return {
		aiddDirty: record.aiddDirty,
		aiddRevision: record.aiddRevision,
		aiddVersion: record.aiddVersion,
	};
}

function mergedProvenanceValues(record: CliActiveRunRecord, existing: typeof runs.$inferSelect) {
	// A non-null CLI snapshot is authoritative. Legacy heartbeats normalize absent fields to
	// null, so retain the launch-time seed instead of erasing provenance the launcher captured.
	return {
		aiddDirty: record.aiddDirty ?? existing.aiddDirty,
		aiddRevision: record.aiddRevision ?? existing.aiddRevision,
		aiddVersion: record.aiddVersion ?? existing.aiddVersion,
	};
}

function buildRunInsertValues(
	record: CliActiveRunRecord,
	status: WebRunStatus,
	completedAt: number,
	durationMs: number,
	errorMessage: null | string,
	stopReason = record.stopReason
): typeof runs.$inferInsert {
	return {
		...provenanceValues(record),
		aiSummary: record.aiSummary,
		backend: record.backend,
		commandArgsJson: commandArgsJson(record),
		completedAt,
		durationMs,
		errorMessage,
		...outputMetricValues(record),
		exitCode: record.exitCode,
		id: record.id,
		logPath: record.logPath,
		mode: record.mode,
		model: record.model,
		pid: record.pid,
		pipelineSessionId: null,
		projectName: record.projectName,
		projectPath: record.projectPath,
		provider: record.provider,
		reasoningEffort: record.reasoningEffort,
		source: record.source,
		startedAt: record.startedAt,
		status,
		stopReason,
		summary: record.summary,
	};
}

export function terminalizeRun(
	tx: LocalTransaction,
	args: TerminalizeRunArgs
): HeartbeatWriteOutcome {
	const { completedAt, continuationValue, durationMs, finalStatus, record } = args;
	const existing = tx.select().from(runs).where(eq(runs.id, record.id)).get();
	if (!existing) {
		tx.insert(runs)
			.values({
				...buildRunInsertValues(record, finalStatus, completedAt, durationMs, null),
				continuationReason: continuationValue,
			})
			.run();
		return { kind: 'inserted' };
	}
	if (TERMINAL_STATUSES.has(existing.status as WebRunStatus)) {
		return { kind: 'already-terminal' };
	}
	tx.update(runs)
		.set({
			...mergedProvenanceValues(record, existing),
			aiSummary: record.aiSummary,
			commandArgsJson: existing.commandArgsJson ?? commandArgsJson(record),
			completedAt,
			// The caller evaluates from heartbeat + ledger facts and cannot see the row; a
			// pipeline-owned run (session linkage lives only here) never chains.
			continuationReason: existing.pipelineSessionId === null ? continuationValue : 'none',
			durationMs,
			exitCode: record.exitCode,
			mode: record.mode,
			status: finalStatus,
			stopReason: record.stopReason,
			summary: record.summary,
			...outputMetricValues(record),
		})
		.where(eq(runs.id, record.id))
		.run();
	return { existing, kind: 'updated' };
}

export function markRunStale(tx: LocalTransaction, args: MarkRunStaleArgs): HeartbeatWriteOutcome {
	const { completedAt, errorMessage, record } = args;
	const existing = tx.select().from(runs).where(eq(runs.id, record.id)).get();
	if (!existing) {
		tx.insert(runs)
			.values(
				buildRunInsertValues(
					record,
					'failed',
					completedAt,
					completedAt - record.startedAt,
					errorMessage,
					record.stopReason ?? 'heartbeat_stale'
				)
			)
			.run();
		return { kind: 'inserted' };
	}
	if (TERMINAL_STATUSES.has(existing.status as WebRunStatus)) {
		return { kind: 'already-terminal' };
	}
	tx.update(runs)
		.set({
			...mergedProvenanceValues(record, existing),
			aiSummary: record.aiSummary,
			commandArgsJson: existing.commandArgsJson ?? commandArgsJson(record),
			completedAt,
			durationMs: completedAt - existing.startedAt,
			errorMessage,
			exitCode: -1,
			mode: record.mode,
			status: 'failed',
			stopReason: record.stopReason ?? 'heartbeat_stale',
			summary: record.summary,
			...outputMetricValues(record),
		})
		.where(eq(runs.id, record.id))
		.run();
	return { existing, kind: 'updated' };
}

// In-session counterpart to the boot-time reconcileStaleRuns: force-fails a still-running row
// whose supervising process died without ever writing a heartbeat file (the one transition the
// heartbeat-file-driven HeartbeatWatcher cannot observe). The existence/terminal guard runs in
// the same IMMEDIATE transaction as the update, so a concurrent heartbeat terminalize landing
// between read and write is never clobbered.
export function reconcileDeadRun(
	tx: LocalTransaction,
	args: ReconcileDeadRunArgs
): HeartbeatWriteOutcome {
	const { completedAt, errorMessage, exitCode, runId, stopReason } = args;
	const existing = tx.select().from(runs).where(eq(runs.id, runId)).get();
	if (!existing) return { kind: 'already-terminal' };
	if (TERMINAL_STATUSES.has(existing.status as WebRunStatus)) {
		return { kind: 'already-terminal' };
	}
	tx.update(runs)
		.set({
			completedAt,
			durationMs: completedAt - existing.startedAt,
			errorMessage,
			exitCode,
			status: 'failed',
			stopReason,
		})
		.where(eq(runs.id, runId))
		.run();
	return { existing, kind: 'updated' };
}
