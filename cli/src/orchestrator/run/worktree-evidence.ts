// Run-evidence persistence + worktree finalization. A worktree run writes its iteration logs
// and ledger into the throwaway checkout's `.aidd`, which is gitignored — nothing rides the
// merge back, and the worktree is removed on success AND failure. Without this module every
// worktree run silently destroyed its own evidence. Finalization therefore always copies the
// run's iteration files into the canonical `.aidd/iterations` FIRST (success, failure, no-work,
// and parked alike), then decides the worktree's fate, and only applies the run's metadata
// delta to the canonical store when the source merge landed (or was a no-op).

import type { WorktreePlan } from 'aidd-shared/plan/types';

import { metadataPath } from 'aidd-shared/metadata/paths';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { MergeConflictResolver } from './merge-resolver.ts';
import type { WorktreeMetadataSession } from './worktree-metadata-session.ts';

import { type MergeBackStatus, mergeRunBack, removeRunWorktree } from './worktree-manager.ts';
import {
	detectWorktreeMetadataConflicts,
	writeBackWorktreeMetadata,
} from './worktree-metadata-session.ts';

export interface WorktreeFinalization {
	/** Iteration files copied into the canonical `.aidd/iterations`. */
	evidenceFiles: number;
	/** Present when copying evidence into the canonical `.aidd` FAILED: the worktree (holding
	 * the only copy of the run's iteration logs) is preserved instead of removed, whatever the
	 * merge outcome, so the logs can be recovered manually. */
	evidencePersistFailed?: true;
	/** How the run branch resolved; 'discarded' = non-success run rolled back unmerged,
	 * 'withheld' = success run whose merge was never attempted because a metadata conflict
	 * parked it first (run branch intact in the preserved worktree). */
	mergeStatus: 'discarded' | 'withheld' | MergeBackStatus;
	/** Metadata files applied to the canonical store (merged/noop runs only). */
	metadataApplied?: number;
	/** `.aidd` paths the run changed or deleted that ALSO changed canonically mid-run, forcing
	 * a park. Present only on a metadata-conflict park (canonical metadata left untouched). */
	metadataConflict?: string[];
	/** Present when the run must surface a non-success code (parked merge, exit 77). */
	overrideExitCode?: number;
}

const iterationFilePattern = /^(\d+)\.(json|log)$/;

function iterationStem(index: number): string {
	return String(index).padStart(3, '0');
}

async function nextCanonicalIndex(iterationsDir: string): Promise<number> {
	let entries: string[];
	try {
		entries = await readdir(iterationsDir);
	} catch {
		return 1;
	}
	const indexes = entries
		.map((entry) => entry.match(/^(\d+)\.log$/)?.[1])
		.filter((value): value is string => value !== undefined)
		.map(Number)
		.filter(Number.isInteger);
	return indexes.length === 0 ? 1 : Math.max(...indexes) + 1;
}

// Exclusive-create (`wx`) makes index allocation atomic across concurrent runs finalizing into
// the same canonical store: the loser of a stem race just advances to the next free slot.
async function allocateIterationSlot(
	iterationsDir: string,
	startIndex: number,
	log: Uint8Array,
): Promise<number> {
	for (let index = startIndex; ; index++) {
		try {
			await writeFile(join(iterationsDir, `${iterationStem(index)}.log`), log, {
				flag: 'wx',
			});
			return index;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
		}
	}
}

/** Copy the worktree's run-local iteration files (001.log/json, 002.…) into the canonical
 * `.aidd/iterations`, renumbering onto fresh canonical indices so the `NNN.log` naming contract
 * holds. The structured records keep their run-local `iteration` ordinal and `runId`, which tie
 * each file back to its run regardless of the canonical filename. Returns files copied. */
export async function persistRunEvidence(projectDir: string, worktreeDir: string): Promise<number> {
	const sourceDir = metadataPath(worktreeDir, 'iterations');
	let entries: string[];
	try {
		entries = await readdir(sourceDir);
	} catch {
		return 0;
	}
	const stems = new Map<number, { json?: string; log?: string }>();
	for (const entry of entries) {
		const match = entry.match(iterationFilePattern);
		if (!match) continue;
		const slot = stems.get(Number(match[1])) ?? {};
		slot[match[2] as 'json' | 'log'] = entry;
		stems.set(Number(match[1]), slot);
	}
	if (stems.size === 0) return 0;
	const targetDir = metadataPath(projectDir, 'iterations');
	await mkdir(targetDir, { recursive: true });
	let nextIndex = await nextCanonicalIndex(targetDir);
	let copied = 0;
	for (const stem of [...stems.keys()].sort((a, b) => a - b)) {
		const slot = stems.get(stem);
		if (slot?.log === undefined) continue;
		const log = await readFile(join(sourceDir, slot.log));
		nextIndex = await allocateIterationSlot(targetDir, nextIndex, log);
		copied++;
		if (slot.json !== undefined) {
			await writeFile(
				join(targetDir, `${iterationStem(nextIndex)}.json`),
				await readFile(join(sourceDir, slot.json)),
			);
			copied++;
		}
		nextIndex++;
	}
	return copied;
}

/** Decide a finished worktree run's fate:
 *
 * 1. Persist run evidence canonically — before any removal, for every outcome. If persistence
 *    itself fails, every branch below preserves the worktree instead of removing it.
 * 2. Non-success exit: discard the worktree (free rollback; canonical metadata untouched).
 * 3. Metadata conflict (checked BEFORE the merge): a `.aidd` file the run changed/deleted also
 *    changed canonically mid-run. Applying would silently clobber a concurrent edit, so the
 *    merge is never attempted, the whole delta is withheld, the worktree is preserved, and the
 *    run parks (exit 77) with the conflicting paths surfaced. Nothing — code or metadata —
 *    reaches the live tree, so the parked feature cannot end up merged-but-not-completed.
 * 4. Success: merge the source branch back; on merged/noop apply the metadata delta to the
 *    canonical store, then remove the worktree. (Write-back re-checks for conflicts as a
 *    last-resort guard against edits racing in after step 3; that late park leaves the merged
 *    code in place but never clobbers canonical metadata.)
 * 5. Blocked/conflicted merge: preserve the worktree AND withhold the metadata delta — nothing
 *    reached the live tree, so canonical metadata must not claim otherwise — and surface
 *    `mergeConflictParked` (77) for the ledger/heartbeat.
 */
// Which run outcomes keep what the run built. Success obviously; flailing too — the guard stops a
// run whose LAST iterations went in circles, and earlier ones may have landed real commits. Those
// are merged back and the feature parks as waiting_approval for a human, exactly as when flailing
// reported exit 0. Every other non-zero code means the run failed and its checkout is discarded.
function keepsRunWork(exitCode: number): boolean {
	return (
		exitCode === orchestratorExitCodes.success || exitCode === orchestratorExitCodes.flailing
	);
}

export async function finalizeRunWorktree(input: {
	exitCode: number;
	projectDir: string;
	resolveConflict?: MergeConflictResolver;
	session: WorktreeMetadataSession;
	worktree: WorktreePlan;
}): Promise<WorktreeFinalization> {
	const { exitCode, projectDir, resolveConflict, session, worktree } = input;
	// Evidence persistence must never fail SILENTLY into worktree removal — the worktree holds
	// the only copy of the run's logs. On failure, every branch below preserves the checkout.
	let evidenceFiles = 0;
	let evidencePersisted = true;
	try {
		evidenceFiles = await persistRunEvidence(projectDir, worktree.dir);
	} catch (err) {
		evidencePersisted = false;
		console.warn(
			`[worktree] evidence persistence FAILED (${err instanceof Error ? err.message : String(err)}); ` +
				`preserving worktree ${worktree.dir} so the run's iteration logs are not destroyed — recover its .aidd/iterations manually.`,
		);
	}
	const removeOrPreserve = async (): Promise<void> => {
		if (evidencePersisted) await removeRunWorktree(projectDir, worktree);
	};
	const evidenceFlag = evidencePersisted ? {} : ({ evidencePersistFailed: true } as const);
	if (!keepsRunWork(exitCode)) {
		await removeOrPreserve();
		console.log(
			`[worktree] run failed (exit ${exitCode}); ${evidencePersisted ? 'discarded' : 'preserved (evidence unrecovered)'} worktree ${worktree.branch} (live tree untouched, ${evidenceFiles} evidence file(s) preserved).`,
		);
		return { ...evidenceFlag, evidenceFiles, mergeStatus: 'discarded' };
	}
	// Metadata-conflict check BEFORE the merge: a park must mean nothing reached the live tree.
	// Checking after mergeRunBack would land the run's code and THEN report a park — leaving the
	// feature's code merged while its canonical status stays stale, so the next selection cycle
	// could re-pick already-landed work.
	const conflicted = await detectWorktreeMetadataConflicts(projectDir, worktree.dir, session);
	if (conflicted.length > 0) {
		console.warn(
			`[worktree] metadata conflict — ${conflicted.length} .aidd file(s) changed ` +
				`canonically mid-run (run also changed them): ${conflicted.join(', ')}; ` +
				`merge not attempted, preserved worktree ${worktree.branch} at ${worktree.dir} ` +
				`for manual reconciliation (exit ${orchestratorExitCodes.mergeConflictParked}); ` +
				`live tree and canonical metadata left unchanged.`,
		);
		return {
			...evidenceFlag,
			evidenceFiles,
			mergeStatus: 'withheld',
			metadataConflict: conflicted,
			overrideExitCode: orchestratorExitCodes.mergeConflictParked,
		};
	}
	const merge = await mergeRunBack(projectDir, worktree, resolveConflict);
	if (merge.status === 'merged' || merge.status === 'noop') {
		const result = await writeBackWorktreeMetadata(projectDir, worktree.dir, session);
		// Last-resort race guard: a canonical edit landed in the window between the pre-merge
		// conflict check and this write. The code merge already landed and stays, but canonical
		// metadata is never clobbered — the delta is withheld and the run parks with the paths
		// surfaced for manual reconciliation.
		if ('conflicted' in result) {
			console.warn(
				`[worktree] metadata conflict raced in after the merge — ${result.conflicted.length} ` +
					`.aidd file(s) changed canonically between the pre-merge check and write-back: ` +
					`${result.conflicted.join(', ')}; source merge kept, metadata delta withheld, ` +
					`preserved worktree ${worktree.branch} at ${worktree.dir} for manual reconciliation ` +
					`(exit ${orchestratorExitCodes.mergeConflictParked}); canonical metadata left unchanged.`,
			);
			return {
				...evidenceFlag,
				evidenceFiles,
				mergeStatus: merge.status,
				metadataConflict: result.conflicted,
				overrideExitCode: orchestratorExitCodes.mergeConflictParked,
			};
		}
		await removeOrPreserve();
		console.log(
			`[worktree] merge-back ${merge.status}; applied ${result.applied.length} metadata file(s) (${result.deleted.length} deleted), ${evidencePersisted ? 'removed' : 'preserved (evidence unrecovered)'} worktree ${worktree.branch}.`,
		);
		return {
			...evidenceFlag,
			evidenceFiles,
			mergeStatus: merge.status,
			metadataApplied: result.applied.length,
		};
	}
	console.warn(
		`[worktree] merge-back ${merge.status}; preserved branch ${worktree.branch} at ${worktree.dir} ` +
			`for manual resolution (exit ${orchestratorExitCodes.mergeConflictParked}); canonical metadata left unchanged.`,
	);
	return {
		...evidenceFlag,
		evidenceFiles,
		mergeStatus: merge.status,
		overrideExitCode: orchestratorExitCodes.mergeConflictParked,
	};
}
