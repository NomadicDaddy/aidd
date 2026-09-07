import { describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { FileAiddStore } from 'aidd-shared/metadata/store';

import { claimSelectedFeatureForIteration } from '../../cli/src/orchestrator/run/feature-scope.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function makeStore(name: string): Promise<FileAiddStore> {
	const root = await testTempDir(`feature-claim-${name}`);
	const projectDir = join(root, name);
	await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
	return new FileAiddStore(projectDir);
}

const work = { description: 'Live feature', id: 'feature-live', kind: 'feature' as const };

describe('claimSelectedFeatureForIteration', () => {
	test('claims an actionable feature as in_progress', async () => {
		const store = await makeStore('actionable');
		await store.writeFeature({ id: 'feature-live', passes: false, status: 'backlog' });

		expect(await claimSelectedFeatureForIteration(store, work)).toEqual({
			featureId: 'feature-live',
			vanished: false,
		});
		expect((await store.readFeature('feature-live')).status).toBe('in_progress');
	});

	// A park is a pending human decision. Claiming must not erase it, or the decision is discarded
	// and the blockingContext the queue renders is orphaned against open work. selectNextFeature
	// filters waiting_approval today, so this guards the invariant rather than a live path.
	test('leaves a parked feature parked', async () => {
		const store = await makeStore('parked');
		await store.writeFeature({
			blockingContext: {
				commands: [],
				outcomeStatus: 'verification_blocked_self_parked',
				outputExcerpt: 'CLS reproduced but no LayoutShift event captured.',
				parkedAt: '2026-07-20T16:11:00.000Z',
				reason: 'verification_blocked_self_parked',
			},
			id: 'feature-live',
			passes: false,
			status: 'waiting_approval',
		});

		expect(await claimSelectedFeatureForIteration(store, work)).toEqual({
			featureId: 'feature-live',
			vanished: false,
		});
		const feature = await store.readFeature('feature-live');
		expect(feature.status).toBe('waiting_approval');
		expect(feature.blockingContext?.outputExcerpt).toContain('no LayoutShift event');
	});

	test('leaves a completed passing feature untouched', async () => {
		const store = await makeStore('completed');
		await store.writeFeature({ id: 'feature-live', passes: true, status: 'completed' });

		expect(await claimSelectedFeatureForIteration(store, work)).toEqual({
			featureId: 'feature-live',
			vanished: false,
		});
		expect((await store.readFeature('feature-live')).status).toBe('completed');
	});

	test('ignores non-feature work', async () => {
		const store = await makeStore('generic');
		const generic = { description: 'directive', id: 'directive', kind: 'generic' as const };

		expect(await claimSelectedFeatureForIteration(store, generic)).toEqual({
			featureId: undefined,
			vanished: false,
		});
	});
});
