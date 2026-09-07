import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	ProjectLocalIterationDto,
	ProjectLocalRunDto,
	ProjectUsageSummaryDto,
} from '../../types.ts';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { readJsonOrNull, readTextOrNull } from '../fsHelpers.ts';
import {
	ITERATION_SCAN_LIMIT,
	iterationEntryNumber,
	localIterationFromArtifact,
	localRunFromLedgerEntry,
	type RawIterationArtifact,
	type RawRunLedgerEntry,
} from './iterationParseHelpers.ts';
import { finalizedRunLedgerEntries, projectUsageFromLedgerEntries } from './projectUsage.ts';

export { projectUsageFromLedgerEntries } from './projectUsage.ts';
export { syncStateFromLocalData } from './syncStateHelpers.ts';

const localIterationResultLimit = 20;
const localIterationScanLimit = ITERATION_SCAN_LIMIT;
const localRunResultLimit = 20;

export interface ProjectRunLedgerMetadata {
	localRuns: ProjectLocalRunDto[];
	runIds: Set<string>;
	usage: ProjectUsageSummaryDto;
}

export async function gatherLocalIterations(
	metadataDir: string,
): Promise<ProjectLocalIterationDto[]> {
	let entries: string[];
	try {
		entries = await readdir(join(metadataDir, 'iterations'));
	} catch {
		recordDataMovement({
			category: 'metadata',
			operation: 'metadata.iterations',
			status: 'miss',
			target: join(metadataDir, 'iterations'),
		});
		return [];
	}
	const jsonEntries = entries
		.map((entry) => ({ entry, number: iterationEntryNumber(entry) }))
		.filter((item): item is { entry: string; number: number } => item.number !== null)
		.sort((left, right) => right.number - left.number)
		.slice(0, localIterationScanLimit);
	const records = await Promise.all(
		jsonEntries.map(async ({ entry }) => {
			const parsed = await readJsonOrNull<RawIterationArtifact>(
				join(metadataDir, 'iterations', entry),
			);
			return parsed ? localIterationFromArtifact(parsed) : null;
		}),
	);
	const result = records
		.filter((record): record is ProjectLocalIterationDto => record !== null)
		.sort((left, right) => {
			const leftTime = left.startedAt ? Date.parse(left.startedAt) : 0;
			const rightTime = right.startedAt ? Date.parse(right.startedAt) : 0;
			return rightTime - leftTime;
		})
		.slice(0, localIterationResultLimit);
	recordDataMovement({
		category: 'metadata',
		operation: 'metadata.iterations',
		status: 'success',
		summary: { count: result.length, scanned: jsonEntries.length, total: entries.length },
		target: join(metadataDir, 'iterations'),
	});
	return result;
}

// Reconcile artifact-derived liveness against the authoritative active-runs/ set. localIterationFromArtifact
// surfaces a 'started' lifecycle artifact (endedAt:null, exitCode:null) as 'running' because the
// orchestrator writes it before the run finalizes. But once the supervising process is gone — no
// record under active-runs/ — that run is not live; its 'started' artifact simply never finalized
// (the run died before writeRunSummary appended a runs.jsonl ledger line). Surface such an iteration
// as terminal (failed) so the UI shows no live/in-progress affordance and the project's derived sync
// state stops reporting a perpetual 'syncing'.
export function reconcileIterationLiveness(
	iterations: ProjectLocalIterationDto[],
	liveRunIds: ReadonlySet<string>,
): ProjectLocalIterationDto[] {
	return iterations.map((iteration) => {
		if (iteration.status !== 'running') return iteration;
		if (iteration.runId !== null && liveRunIds.has(iteration.runId)) return iteration;
		return { ...iteration, status: 'failed' };
	});
}

// Read the ledger once for project detail: recent run rows, all run ids used for iteration
// reconciliation, and all-history usage accounting share the same file-backed snapshot.
export async function gatherRunLedgerMetadata(
	metadataDir: string,
): Promise<ProjectRunLedgerMetadata> {
	const content = await readTextOrNull(join(metadataDir, 'runs.jsonl'));
	const empty = {
		localRuns: [],
		runIds: new Set<string>(),
		usage: projectUsageFromLedgerEntries([]),
	};
	if (content === null) {
		recordDataMovement({
			category: 'metadata',
			operation: 'metadata.runs',
			status: 'miss',
			target: join(metadataDir, 'runs.jsonl'),
		});
		return empty;
	}
	const entries: RawRunLedgerEntry[] = [];
	const runIds = new Set<string>();
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed) as null | RawRunLedgerEntry;
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
			entries.push(parsed);
			if (typeof parsed.runId === 'string') runIds.add(parsed.runId);
		} catch {
			continue;
		}
	}
	const finalizedEntries = finalizedRunLedgerEntries(entries);
	const localRuns = finalizedEntries
		.map((entry) => localRunFromLedgerEntry(entry))
		.sort((left, right) => {
			const leftTime = left.startedAt ? Date.parse(left.startedAt) : 0;
			const rightTime = right.startedAt ? Date.parse(right.startedAt) : 0;
			return rightTime - leftTime;
		})
		.slice(0, localRunResultLimit);
	recordDataMovement({
		category: 'metadata',
		operation: 'metadata.runs',
		status: 'success',
		summary: { count: localRuns.length, total: finalizedEntries.length },
		target: join(metadataDir, 'runs.jsonl'),
	});
	return { localRuns, runIds, usage: projectUsageFromLedgerEntries(entries) };
}

// The run-history views must never contradict the runs.jsonl ledger. To decide whether an iteration
// belongs to a recorded run we need every runId the ledger knows — not just the recent slice surfaced
// to the UI — so collect them from the full file. Returns an empty set when the ledger is absent.
export async function gatherLedgerRunIds(metadataDir: string): Promise<Set<string>> {
	return (await gatherRunLedgerMetadata(metadataDir)).runIds;
}

// Drop iterations that belong to an orphaned run — one whose runId is absent from the runs.jsonl
// ledger AND has no live record under active-runs/. Such a run never finalized (e.g. a
// 'pre_backend_claim' 'started' artifact or a verification-timeout exit), so writeRunSummary never
// appended its ledger line. Surfacing its iterations as "Unassigned iterations" rows would show
// activity the ledger does not record, contradicting the baseline in both the project Runs tab and
// the global run-history section. An iteration with no runId is left untouched: it is matched to a
// run window by start time instead.
export function excludeOrphanIterations(
	iterations: ProjectLocalIterationDto[],
	ledgerRunIds: ReadonlySet<string>,
	liveRunIds: ReadonlySet<string>,
): ProjectLocalIterationDto[] {
	return iterations.filter((iteration) => {
		if (iteration.runId === null) return true;
		return ledgerRunIds.has(iteration.runId) || liveRunIds.has(iteration.runId);
	});
}

export async function gatherLocalRuns(metadataDir: string): Promise<ProjectLocalRunDto[]> {
	return (await gatherRunLedgerMetadata(metadataDir)).localRuns;
}
