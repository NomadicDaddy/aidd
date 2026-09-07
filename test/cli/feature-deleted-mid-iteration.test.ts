import type { AgentRunResult } from 'aidd-shared/orchestrator/result';
import type { SelectedWork } from 'aidd-shared/modes/types';

import { describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { removeTempTree } from 'aidd-shared/lib/remove-temp-tree';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { readFeatureIfPresent } from 'aidd-shared/metadata/store/read-optional';

import { evaluateFeatureCompletion } from '../../cli/src/modes/coding/completion.ts';
import {
	parkBlockedVerificationFeature,
	recordVerificationSelfPark,
} from '../../cli/src/modes/coding/verification.ts';
import {
	applySimulatedFeatureCompletion,
	parkCompletionsPendingCommit,
} from '../../cli/src/orchestrator/run/completion-persistence.ts';
import { claimSelectedFeatureForIteration } from '../../cli/src/orchestrator/run/feature-scope.ts';
import { testTempDir } from '../_helpers/temp.ts';

// A concurrent run against the same working tree — a `consolidate-features` directive, an operator
// prune — can delete the selected feature's record while this iteration is still running. Every
// post-turn reader that reads the record raw throws ENOENT straight out of iteration finalization,
// so the iteration never closes and the run's totals are dropped — a run that committed
// gate-passing work ledgers an hour of zeros.

const FEATURE_ID = 'remediation-pipeline-progress';

const work: SelectedWork = {
	data: { status: 'in_progress' },
	description: 'Selected feature',
	id: FEATURE_ID,
	kind: 'feature',
};

async function storeWithCompletedFeature(name: string): Promise<{
	projectDir: string;
	store: FileAiddStore;
}> {
	const root = await testTempDir(`feature-deleted-${name}`);
	const projectDir = join(root, name);
	await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
	const store = new FileAiddStore(projectDir);
	await store.writeFeature({ id: FEATURE_ID, passes: true, status: 'completed' });
	return { projectDir, store };
}

/** What the concurrent consolidation does: the whole feature directory goes away. */
async function deleteFeatureRecord(projectDir: string): Promise<void> {
	await removeTempTree(join(projectDir, '.aidd', 'features', FEATURE_ID));
}

function completionResult(): AgentRunResult {
	return {
		events: [
			{
				chunk: `Implemented and committed.\n\nAIDD_RESULT: {"featureId":"${FEATURE_ID}","status":"completed","passes":true}`,
				type: 'assistant_text',
			},
		],
		exitCode: 0,
		filesModified: [],
		selectedWork: work,
		structuredResult: { featureId: FEATURE_ID, passes: true, status: 'completed' },
		transcript: '',
	};
}

describe('feature record deleted mid-iteration', () => {
	test('readFeatureIfPresent absorbs a missing record and rethrows a corrupt one', async () => {
		const { projectDir, store } = await storeWithCompletedFeature('helper');
		expect((await readFeatureIfPresent(store, FEATURE_ID))?.id).toBe(FEATURE_ID);

		await deleteFeatureRecord(projectDir);
		// The raw read is what kills the run if a post-turn caller does it.
		expect(store.readFeature(FEATURE_ID)).rejects.toThrow(/ENOENT/);
		expect(await readFeatureIfPresent(store, FEATURE_ID)).toBeUndefined();

		// A record that exists but will not parse is a different fault with its own reporting
		// path, so it must still surface rather than masquerading as a deletion.
		await mkdir(join(projectDir, '.aidd', 'features', FEATURE_ID), { recursive: true });
		await Bun.write(
			join(projectDir, '.aidd', 'features', FEATURE_ID, 'feature.json'),
			'{"id":"broken",',
		);
		expect(readFeatureIfPresent(store, FEATURE_ID)).rejects.toThrow();
	});

	test('a completion claim against a deleted record is ignored, not thrown', async () => {
		const { projectDir, store } = await storeWithCompletedFeature('completion');
		await deleteFeatureRecord(projectDir);

		const evaluation = await evaluateFeatureCompletion(store, completionResult());

		expect(evaluation.shouldComplete).toBe(false);
		expect(evaluation.verificationBlockedParked).toBe(false);
		expect(evaluation.selectedFeatureId).toBe(FEATURE_ID);
		expect(evaluation.completionMarkerIgnored).toContain('no longer exists on disk');
		expect(evaluation.completionMarkerIgnored).toContain(FEATURE_ID);
	});

	test('an intact record still honors the completion claim', async () => {
		const { store } = await storeWithCompletedFeature('honored');

		const evaluation = await evaluateFeatureCompletion(store, completionResult());

		expect(evaluation.shouldComplete).toBe(true);
		expect(evaluation.completionOutcome).toBe('completed');
		expect(evaluation.completionMarkerIgnored).toBeUndefined();
	});

	test('a blocked-verification claim reports the park it could not perform', async () => {
		const { projectDir, store } = await storeWithCompletedFeature('blocked');
		await deleteFeatureRecord(projectDir);
		const result = completionResult();
		result.events.push({
			chunk: 'Live browser verification was blocked, so I could not verify the fix.',
			type: 'assistant_text',
		});

		const evaluation = await evaluateFeatureCompletion(store, result);

		// The claim is still rejected, but aidd must not report a park that never landed.
		expect(evaluation.shouldComplete).toBe(false);
		expect(evaluation.verificationBlockedParked).toBe(false);
		expect(evaluation.completionMarkerIgnored).toContain('could not be parked');
	});

	test('the park helpers no-op instead of throwing', async () => {
		const { projectDir, store } = await storeWithCompletedFeature('parks');
		await deleteFeatureRecord(projectDir);

		expect(
			await parkBlockedVerificationFeature(store, FEATURE_ID, {
				excerpt: 'could not verify',
				phrase: 'could not verify',
			}),
		).toBe(false);
		expect(await recordVerificationSelfPark(store, FEATURE_ID, 'in_progress', 'blocked')).toBe(
			false,
		);
		await parkCompletionsPendingCommit({
			blockingContext: {
				commands: [],
				outcomeStatus: 'completion_requires_commit',
				outputExcerpt: '',
				parkedAt: new Date().toISOString(),
				reason: 'completion_requires_commit',
			},
			completedFeatures: [FEATURE_ID],
			parkedAt: new Date().toISOString(),
			snapshotBefore: { completed: new Map(), unreadable: [] },
			store,
		});
		await applySimulatedFeatureCompletion({
			iterationCommitCount: 1,
			store,
			structuredResult: { featureId: FEATURE_ID, passes: true, status: 'completed' },
			work,
		});

		// None of the above resurrected the record, and none of them threw.
		expect(await readFeatureIfPresent(store, FEATURE_ID)).toBeUndefined();
	});

	test('claiming a record deleted before the iteration reports it as vanished', async () => {
		const { projectDir, store } = await storeWithCompletedFeature('claim');
		await deleteFeatureRecord(projectDir);

		// Attribution survives — the run did select it — but `vanished` is what stops the loop from
		// dispatching an agent at a feature directory whose spec and notes no longer exist. Throwing
		// instead would abort the whole run over a concurrent run's edit.
		expect(await claimSelectedFeatureForIteration(store, work)).toEqual({
			featureId: FEATURE_ID,
			vanished: true,
		});
	});
});
