import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import {
	type FeatureContext,
	updateFeatureStatus,
} from '../../backend/src/services/project/features.ts';
import { testTempDir } from '../_helpers/temp.ts';

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
