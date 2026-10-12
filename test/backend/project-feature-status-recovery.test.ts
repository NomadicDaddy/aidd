import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import {
	type FeatureContext,
	updateFeatureStatus as updateFeatureStatusWithRuns,
} from '../../backend/src/services/project/features.ts';
import { testTempDir } from '../_helpers/temp.ts';

/** The ordinary case: nothing is running in the project. */
function updateFeatureStatus(
	context: FeatureContext,
	projectId: string,
	featureDirectory: string,
	status: string,
) {
	return updateFeatureStatusWithRuns(context, projectId, featureDirectory, status, () =>
		Promise.resolve(false),
	);
}

async function contextWithFeature(status: string): Promise<{
	context: FeatureContext;
	featurePath: string;
}> {
	const projectDir = await testTempDir('aidd-feature-status-recovery-');
	const featureId = 'feature-status-recovery';
	const featurePath = join(projectDir, '.aidd', 'features', featureId, 'feature.json');
	await mkdir(join(projectDir, '.aidd', 'features', featureId), { recursive: true });
	await Bun.write(
		featurePath,
		JSON.stringify({ id: featureId, passes: false, status, title: 'Status recovery' }),
	);
	const store = new FileAiddStore(projectDir);
	return {
		context: {
			resolveDiscoveredProject: async () => projectDir,
			storeForProject: async () => store,
		},
		featurePath,
	};
}

describe('project feature status recovery', () => {
	test('rewrites an invalid persisted status to a canonical status', async () => {
		const { context, featurePath } = await contextWithFeature('pending');

		const updated = await updateFeatureStatus(
			context,
			'project-id',
			'feature-status-recovery',
			'completed',
		);

		expect(updated).toMatchObject({ passes: true, status: 'completed' });
		const persisted = JSON.parse(await readFile(featurePath, 'utf8')) as {
			passes: boolean;
			status: string;
		};
		expect(persisted).toMatchObject({ passes: true, status: 'completed' });
	});

	test('keeps valid non-backlog workflow states protected', async () => {
		const { context } = await contextWithFeature('in_progress');

		await expect(
			updateFeatureStatus(context, 'project-id', 'feature-status-recovery', 'completed'),
		).rejects.toThrow('Only backlog or invalid-status features can be updated inline');
	});
});

describe('deferring a feature from the panel', () => {
	const id = 'feature-status-recovery';

	test('a backlog feature can be deferred and stays not passing', async () => {
		const { context, featurePath } = await contextWithFeature('backlog');

		const updated = await updateFeatureStatus(context, 'project-id', id, 'deferred');

		expect(updated).toMatchObject({ passes: false, status: 'deferred' });
		const persisted = JSON.parse(await readFile(featurePath, 'utf8')) as { status: string };
		expect(persisted.status).toBe('deferred');
	});

	test('a feature waiting on approval can be deferred, and nothing else', async () => {
		const deferring = await contextWithFeature('waiting_approval');
		expect(
			await updateFeatureStatus(deferring.context, 'project-id', id, 'deferred'),
		).toMatchObject({ status: 'deferred' });

		const approving = await contextWithFeature('waiting_approval');
		await expect(
			updateFeatureStatus(approving.context, 'project-id', id, 'backlog'),
		).rejects.toThrow('a feature waiting on approval can only be deferred');
	});

	test('a deferred feature returns to backlog and to nothing else', async () => {
		const returning = await contextWithFeature('deferred');
		expect(
			await updateFeatureStatus(returning.context, 'project-id', id, 'backlog'),
		).toMatchObject({ passes: false, status: 'backlog' });

		for (const next of ['completed', 'in_progress', 'waiting_approval']) {
			const { context } = await contextWithFeature('deferred');
			await expect(updateFeatureStatus(context, 'project-id', id, next)).rejects.toThrow(
				'A deferred feature can only be returned to backlog',
			);
		}
	});

	// A run restores any record that crossed into or out of deferred during its iteration, and it
	// cannot tell an agent's edit from a person's. So the panel refuses the change while a run is
	// active, instead of accepting a decision the run would then undo.
	test('refuses to defer, or to return a deferred feature, while a run is active', async () => {
		const runActive = () => Promise.resolve(true);

		const deferring = await contextWithFeature('backlog');
		await expect(
			updateFeatureStatusWithRuns(deferring.context, 'project-id', id, 'deferred', runActive),
		).rejects.toThrow('A run is active in this project');
		const stillBacklog = JSON.parse(await readFile(deferring.featurePath, 'utf8')) as {
			status: string;
		};
		expect(stillBacklog.status).toBe('backlog');

		const returning = await contextWithFeature('deferred');
		await expect(
			updateFeatureStatusWithRuns(returning.context, 'project-id', id, 'backlog', runActive),
		).rejects.toThrow('A run is active in this project');

		// The control: a change that does not touch deferred is not held up by the run.
		const completing = await contextWithFeature('backlog');
		expect(
			await updateFeatureStatusWithRuns(
				completing.context,
				'project-id',
				id,
				'completed',
				runActive,
			),
		).toMatchObject({ status: 'completed' });
	});

	test('work already in progress cannot be deferred inline', async () => {
		const { context } = await contextWithFeature('in_progress');

		await expect(updateFeatureStatus(context, 'project-id', id, 'deferred')).rejects.toThrow(
			'Only backlog or invalid-status features can be updated inline',
		);
	});
});
