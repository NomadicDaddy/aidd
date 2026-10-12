import { describe, expect, test } from 'bun:test';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import type { OrchestratorDeps, RunAccumulator } from '../../cli/src/orchestrator/run/types.ts';

import {
	pushDeferredRestorations,
	restoreDeferredStatus,
} from '../../cli/src/orchestrator/run/deferred-guard.ts';
import { endRunIfIterationGuardTripped } from '../../cli/src/orchestrator/run/post-iteration-guards.ts';
import {
	captureFeatureCompletionSnapshot,
	claimSelectedFeatureForIteration,
} from '../../cli/src/orchestrator/run/feature-scope.ts';
import { testTempDir } from '../_helpers/temp.ts';

// Only a person sets or clears `deferred`. An agent edits feature.json directly, so the rule is
// enforced after each iteration: these cases make the edit an agent would make and check that the
// guard puts the record back, and leaves alone everything it has no business touching.

async function storeWith(features: Record<string, { passes: boolean; status: string }>) {
	const store = new FileAiddStore(await testTempDir('aidd-deferred-guard-'));
	for (const [id, state] of Object.entries(features)) {
		await store.writeFeature({ id, title: id, ...state });
	}
	return store;
}

async function statusOf(store: FileAiddStore, id: string) {
	const feature = await store.readFeature(id);
	return { passes: feature.passes, status: feature.status };
}

describe('deferred guard', () => {
	test('a record an agent took out of deferred is deferred again', async () => {
		const store = await storeWith({ 'set-aside': { passes: false, status: 'deferred' } });
		const before = await captureFeatureCompletionSnapshot(store);

		const worked = await store.readFeature('set-aside');
		await store.writeFeature({
			...worked,
			notes: ['built it'],
			passes: true,
			status: 'completed',
		});

		expect(await restoreDeferredStatus(store, before)).toEqual([
			{ featureId: 'set-aside', found: 'completed', restored: 'deferred' },
		]);
		expect(await statusOf(store, 'set-aside')).toEqual({ passes: false, status: 'deferred' });
		// Only the status is put back; the rest of the agent's edit is kept.
		expect((await store.readFeature('set-aside')).notes).toEqual(['built it']);
	});

	test('a record an agent deferred goes back to the status it had', async () => {
		const store = await storeWith({
			'open-work': { passes: false, status: 'backlog' },
			shipped: { passes: true, status: 'completed' },
		});
		const before = await captureFeatureCompletionSnapshot(store);

		for (const id of ['open-work', 'shipped']) {
			const feature = await store.readFeature(id);
			await store.writeFeature({ ...feature, passes: false, status: 'deferred' });
		}

		expect(await restoreDeferredStatus(store, before)).toHaveLength(2);
		expect(await statusOf(store, 'open-work')).toEqual({ passes: false, status: 'backlog' });
		expect(await statusOf(store, 'shipped')).toEqual({ passes: true, status: 'completed' });
	});

	test('a record created deferred during the iteration becomes backlog', async () => {
		const store = await storeWith({});
		const before = await captureFeatureCompletionSnapshot(store);

		await store.writeFeature({ id: 'new-record', passes: false, status: 'deferred' });

		expect(await restoreDeferredStatus(store, before)).toEqual([
			{ featureId: 'new-record', found: 'deferred', restored: 'backlog' },
		]);
		expect((await statusOf(store, 'new-record')).status).toBe('backlog');
	});

	test('writes nothing when no record crossed the line', async () => {
		const store = await storeWith({
			'open-work': { passes: false, status: 'backlog' },
			'set-aside': { passes: false, status: 'deferred' },
		});
		const before = await captureFeatureCompletionSnapshot(store);

		const worked = await store.readFeature('open-work');
		await store.writeFeature({ ...worked, passes: true, status: 'completed' });

		expect(await restoreDeferredStatus(store, before)).toEqual([]);
		expect(await statusOf(store, 'open-work')).toEqual({ passes: true, status: 'completed' });
		expect((await statusOf(store, 'set-aside')).status).toBe('deferred');
	});

	// A run that ends on its wall clock has still had an agent editing records. The restoration
	// runs ahead of that exit, so the timeout path cannot leave a changed deferral behind. The
	// timeout branch itself needs a whole run to write its summary, which this fixture does not
	// have, so the call is allowed to fail after the point under test.
	test('restores before a wall-clock timeout ends the run', async () => {
		const store = await storeWith({ 'set-aside': { passes: false, status: 'deferred' } });
		const before = await captureFeatureCompletionSnapshot(store);
		const worked = await store.readFeature('set-aside');
		await store.writeFeature({ ...worked, status: 'in_progress' });
		const acc = { pendingCarryoverNotes: [] } as unknown as RunAccumulator;

		await endRunIfIterationGuardTripped({
			acc,
			deps: { store } as unknown as OrchestratorDeps,
			featureSnapshotBefore: before,
			finalize: {
				completedResultFeature: undefined,
				displayedSummary: 'ran out of time',
			} as never,
			move: () => undefined,
			plan: {} as never,
			wallClockTimedOut: true,
			work: { kind: 'directive' } as never,
		}).catch(() => undefined);

		expect((await statusOf(store, 'set-aside')).status).toBe('deferred');
		expect(acc.pendingCarryoverNotes.join('\n')).toContain('has put it back');
	});

	// A guard that failed has not shown that nothing changed, so its failure is never silent.
	test('says so when the records cannot be checked', async () => {
		const acc = { pendingCarryoverNotes: [] } as unknown as RunAccumulator;
		const brokenStore = {
			listFeatures: () => Promise.reject(new Error('features directory unreadable')),
		};

		await pushDeferredRestorations(acc, { store: brokenStore } as unknown as OrchestratorDeps, {
			completed: new Map(),
			status: new Map(),
			unreadable: [],
		});

		expect(acc.pendingCarryoverNotes).toHaveLength(1);
		expect(acc.pendingCarryoverNotes[0]).toContain('could not check');
		expect(acc.pendingCarryoverNotes[0]).toContain('features directory unreadable');
	});

	test('claiming a deferred record does not turn it into work in progress', async () => {
		const store = await storeWith({ 'set-aside': { passes: false, status: 'deferred' } });

		await claimSelectedFeatureForIteration(store, {
			description: 'set-aside',
			id: 'set-aside',
			kind: 'feature',
		});

		expect((await statusOf(store, 'set-aside')).status).toBe('deferred');
	});
});
