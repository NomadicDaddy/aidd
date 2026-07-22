import { readCliActiveRunRecords } from 'aidd-shared/metadata/active-runs';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RunRecord } from '../../types.ts';

import { RECONCILED_EXIT_CODE } from './types.ts';

function isDirectorCycleProjection(run: RunRecord): boolean {
	return (
		run.source === 'director' &&
		run.mode === 'director' &&
		run.id.startsWith('cycle_') &&
		!run.canKill &&
		!run.canStop
	);
}

// runIds recorded in a project's runs.jsonl ledger. The ledger is append-only and is written by
// every run that reaches finalization (writeRunSummary, for web/cli/director sources alike) —
// but the append itself can fail, so absence from the ledger is corroborating evidence only,
// never proof by itself that a run is synthetic.
export async function readLedgerRunIds(projectPath: string): Promise<Set<string>> {
	const ids = new Set<string>();
	let content: string;
	try {
		content = await readFile(join(metadataPath(projectPath), 'runs.jsonl'), 'utf8');
	} catch {
		return ids;
	}
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const entry = JSON.parse(trimmed) as { runId?: unknown };
			if (typeof entry.runId === 'string') ids.add(entry.runId);
		} catch {
			continue;
		}
	}
	return ids;
}

export interface LedgerTerminalEntry {
	/** Feature ids the run marked complete (null when the ledger line predates the field). */
	completedFeatures: null | string[];
	durationMs: null | number;
	exitCode: null | number;
	/** Project lifecycle phase the run planned against (initializer/onboarding/coding). */
	phase: null | string;
	/** Feature ids the run selected to work (null when the ledger line predates the field). */
	selectedFeatures: null | string[];
	stopReason: null | string;
	summary: null | string;
}

function stringArrayOrNull(value: unknown): null | string[] {
	if (!Array.isArray(value)) return null;
	return value.filter((item): item is string => typeof item === 'string');
}

// Terminal facts per runId from a project's runs.jsonl — used to backfill DB rows whose
// terminal heartbeat lacked exitCode/stopReason (e.g. user-stopped runs whose CLI wrote the
// full ledger line after the web row terminalized). Last entry per runId wins: a
// crash-fallback line can precede the real summary.
export async function readLedgerTerminalEntries(
	projectPath: string
): Promise<Map<string, LedgerTerminalEntry>> {
	const entries = new Map<string, LedgerTerminalEntry>();
	let content: string;
	try {
		content = await readFile(join(metadataPath(projectPath), 'runs.jsonl'), 'utf8');
	} catch {
		return entries;
	}
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: {
			completedFeatures?: unknown;
			durationMs?: unknown;
			exitCode?: unknown;
			phase?: unknown;
			runId?: unknown;
			selectedFeatures?: unknown;
			stopReason?: unknown;
			summary?: unknown;
		};
		try {
			parsed = JSON.parse(trimmed) as typeof parsed;
		} catch {
			continue;
		}
		if (typeof parsed.runId !== 'string' || parsed.runId.length === 0) continue;
		entries.set(parsed.runId, {
			completedFeatures: stringArrayOrNull(parsed.completedFeatures),
			durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : null,
			exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : null,
			phase: typeof parsed.phase === 'string' ? parsed.phase : null,
			selectedFeatures: stringArrayOrNull(parsed.selectedFeatures),
			stopReason: typeof parsed.stopReason === 'string' ? parsed.stopReason : null,
			summary: typeof parsed.summary === 'string' ? parsed.summary : null,
		});
	}
	return entries;
}

// runIds with a record under active-runs/ (including recently-completed ones). A run that just
// finished still has its heartbeat file here until ingest removes it, and its ledger line may lag by
// a moment — so a run present here must never be treated as a ledger phantom.
async function readActiveRunIds(projectPath: string): Promise<Set<string>> {
	const records = await readCliActiveRunRecords(projectPath, { includeCompleted: true }).catch(
		() => []
	);
	return new Set(records.map((record) => record.id));
}

// Reconcile a merged run list against the runs.jsonl ledger and the active-runs/ directory.
// The ledger is a repair source, not a complete authoritative set — its omissions do not prove
// a DB row is fake (the append itself can fail). A phantom therefore needs POSITIVE evidence:
// the row must carry the supervisor's reconciliation sentinel exit code (every force-fail path —
// sweepOrphanedRuns, markRunStale, reconcileDeadRun, boot reconcile — stamps
// RECONCILED_EXIT_CODE), AND be absent from a populated ledger, AND have no active-runs/ record.
// A genuine run whose ledger append failed keeps its real exit code and always survives; hiding
// it would misreport the project's history.
//
// With no runs.jsonl at all (a fresh project, or a hermetic DB-only context) there is nothing to
// corroborate against, so every run is kept. Running runs and runs still present in active-runs/
// are always kept regardless — liveness is owned by active-runs/, not the ledger.
export async function dropLedgerPhantomRuns(items: RunRecord[]): Promise<RunRecord[]> {
	const terminalByProject = new Map<string, RunRecord[]>();
	for (const run of items) {
		if (run.status === 'running') continue;
		if (isDirectorCycleProjection(run)) continue;
		// Positive phantom evidence: only supervisor-reconciled rows are drop candidates.
		if (run.exitCode !== RECONCILED_EXIT_CODE) continue;
		const bucket = terminalByProject.get(run.projectPath);
		if (bucket) bucket.push(run);
		else terminalByProject.set(run.projectPath, [run]);
	}
	if (terminalByProject.size === 0) return items;
	const phantomIds = new Set<string>();
	await Promise.all(
		[...terminalByProject.entries()].map(async ([projectPath, runsForProject]) => {
			const [ledgerIds, activeIds] = await Promise.all([
				readLedgerRunIds(projectPath),
				readActiveRunIds(projectPath),
			]);
			// An absent/empty ledger establishes no authoritative terminal set — nothing to contradict.
			if (ledgerIds.size === 0) return;
			for (const run of runsForProject) {
				if (!ledgerIds.has(run.id) && !activeIds.has(run.id)) phantomIds.add(run.id);
			}
		})
	);
	if (phantomIds.size === 0) return items;
	return items.filter((run) => !phantomIds.has(run.id));
}
