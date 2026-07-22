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

import { mergeRunBack, removeRunWorktree, type MergeBackStatus } from './worktree-manager.ts';
import { writeBackWorktreeMetadata } from './worktree-metadata-session.ts';

export interface WorktreeFinalization {
	/** Iteration files copied into the canonical `.aidd/iterations`. */
	evidenceFiles: number;
	/** Present when copying evidence into the canonical `.aidd` FAILED: the worktree (holding
	 * the only copy of the run's iteration logs) is preserved instead of removed, whatever the
	 * merge outcome, so the logs can be recovered manually. */
	evidencePersistFailed?: true;
	/** How the run branch resolved; 'discarded' = non-success run rolled back unmerged. */
	mergeStatus: 'discarded' | MergeBackStatus;
	/** Metadata files applied to the canonical store (merged/noop runs only). */
	metadataApplied?: number;
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
	log: Uint8Array
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
				await readFile(join(sourceDir, slot.json))
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
 * 3. Success: merge the source branch back; on merged/noop apply the metadata delta to the
 *    canonical store, then remove the worktree.
 * 4. Blocked/conflicted merge: preserve the worktree AND withhold the metadata delta — nothing
 *    reached the live tree, so canonical metadata must not claim otherwise — and surface
 *    `mergeConflictParked` (77) for the ledger/heartbeat.
 */
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
				`preserving worktree ${worktree.dir} so the run's iteration logs are not destroyed — recover its .aidd/iterations manually.`
		);
	}
	const removeOrPreserve = async (): Promise<void> => {
		if (evidencePersisted) await removeRunWorktree(projectDir, worktree);
	};
	const evidenceFlag = evidencePersisted ? {} : ({ evidencePersistFailed: true } as const);
	if (exitCode !== orchestratorExitCodes.success) {
		await removeOrPreserve();
		console.log(
			`[worktree] run failed (exit ${exitCode}); ${evidencePersisted ? 'discarded' : 'preserved (evidence unrecovered)'} worktree ${worktree.branch} (live tree untouched, ${evidenceFiles} evidence file(s) preserved).`
		);
		return { ...evidenceFlag, evidenceFiles, mergeStatus: 'discarded' };
	}
	const merge = await mergeRunBack(projectDir, worktree, resolveConflict);
	if (merge.status === 'merged' || merge.status === 'noop') {
		const delta = await writeBackWorktreeMetadata(projectDir, worktree.dir, session);
		await removeOrPreserve();
		console.log(
			`[worktree] merge-back ${merge.status}; applied ${delta.applied.length} metadata file(s) (${delta.deleted.length} deleted), ${evidencePersisted ? 'removed' : 'preserved (evidence unrecovered)'} worktree ${worktree.branch}.`
		);
		return {
			...evidenceFlag,
			evidenceFiles,
			mergeStatus: merge.status,
			metadataApplied: delta.applied.length,
		};
	}
	console.warn(
		`[worktree] merge-back ${merge.status}; preserved branch ${worktree.branch} at ${worktree.dir} ` +
			`for manual resolution (exit ${orchestratorExitCodes.mergeConflictParked}); canonical metadata left unchanged.`
	);
	return {
		...evidenceFlag,
		evidenceFiles,
		mergeStatus: merge.status,
		overrideExitCode: orchestratorExitCodes.mergeConflictParked,
	};
}
