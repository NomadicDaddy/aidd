import type { AiddStore } from 'aidd-shared/metadata/store';

import type { FeatureCompletionSnapshot, OrchestratorDeps, RunAccumulator } from './types.ts';

import { deferredStatusRestoredNote, deferredStatusUncheckedNote } from './carryover-notes.ts';

export interface DeferredRestoration {
	featureId: string;
	/** The status the iteration left on the record. */
	found: string;
	/** The status the guard wrote back. */
	restored: string;
}

/**
 * Undo any move into or out of `deferred` made during an iteration.
 *
 * `deferred` is scope the owner has set aside, and only a person sets or clears it. An agent edits
 * `feature.json` directly, so the rule is enforced here rather than requested: a record that was
 * deferred when the iteration started is deferred again when it ends, and a record the agent
 * deferred goes back to the status it had. A record created deferred during the iteration becomes
 * `backlog`, the status an agent may create.
 *
 * Only the status (and `passes`, which has to agree with it) is written back; every other edit the
 * iteration made to the record is kept.
 */
export async function restoreDeferredStatus(
	store: AiddStore,
	before: FeatureCompletionSnapshot,
): Promise<DeferredRestoration[]> {
	const restorations: DeferredRestoration[] = [];
	// A record that would not parse when the iteration started has no known earlier status, so a
	// repaired one is left as the repair wrote it instead of being guessed at.
	const unreadableBefore = new Set(before.unreadable.map((failure) => failure.directory));
	for (const feature of await store.listFeatures({ includeAudit: true })) {
		const directory = feature.directory ?? feature.id;
		if (unreadableBefore.has(directory)) continue;
		const wasDeferred = before.status.get(directory) === 'deferred';
		const isDeferred = feature.status === 'deferred';
		if (wasDeferred === isDeferred) continue;
		const restored = wasDeferred ? 'deferred' : (before.status.get(directory) ?? 'backlog');
		await store.writeFeature({
			...feature,
			passes: before.completed.get(directory) === true,
			status: restored,
		});
		restorations.push({
			featureId: directory,
			found: feature.status ?? 'none',
			restored,
		});
	}
	return restorations;
}

/**
 * Run the guard after an iteration, say what it restored, and tell the next iteration not to try
 * again. A store that cannot be read or written here does not end an otherwise good iteration,
 * but it is never silent: a guard that failed has not shown that nothing changed, so the failure
 * goes to the console and to the next iteration.
 */
export async function pushDeferredRestorations(
	acc: RunAccumulator,
	deps: OrchestratorDeps,
	snapshotBefore: FeatureCompletionSnapshot,
): Promise<void> {
	let restorations: DeferredRestoration[];
	try {
		restorations = await restoreDeferredStatus(deps.store, snapshotBefore);
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		console.error(
			`[deferred] could not check or restore deferred feature records after this iteration: ${reason}`,
		);
		acc.pendingCarryoverNotes.push(deferredStatusUncheckedNote(reason));
		return;
	}
	if (restorations.length === 0) return;
	for (const item of restorations) {
		console.error(
			`[deferred] .aidd/features/${item.featureId}/feature.json was left '${item.found}' by the agent; only a person sets or clears 'deferred', so it was restored to '${item.restored}'`,
		);
	}
	acc.pendingCarryoverNotes.push(deferredStatusRestoredNote(restorations));
}
