import { FileAiddStore } from 'aidd-shared/metadata/store';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
	type FeatureContext,
	updateFeatureMetadata,
} from '../../backend/src/services/project/features.ts';
import { testTempDir } from '../_helpers/temp.ts';

describe('project feature category metadata', () => {
	test('writes and removes category in the feature.json backing the Source control', async () => {
		const projectDir = await testTempDir('aidd-feature-category-');
		const store = new FileAiddStore(projectDir);
		await store.writeFeature({
			aiddReport: { source: 'aidd-web-report' },
			approval: { source: 'web-ui' },
			category: 'Core',
			dependencies: [],
			id: 'feature-source',
			passes: false,
			status: 'backlog',
		});
		const context: FeatureContext = {
			resolveDiscoveredProject: () => Promise.resolve(projectDir),
			storeForProject: () => Promise.resolve(store),
		};
		const featurePath = join(projectDir, '.aidd', 'features', 'feature-source', 'feature.json');

		await updateFeatureMetadata(context, 'project', 'feature-source', {
			category: ' Backend ',
		});
		const changed = JSON.parse(await readFile(featurePath, 'utf8')) as Record<string, unknown>;
		expect(changed.category).toBe('Backend');
		expect(changed.approval).toEqual({ source: 'web-ui' });
		expect(changed.aiddReport).toEqual({ source: 'aidd-web-report' });

		await updateFeatureMetadata(context, 'project', 'feature-source', { category: null });
		const cleared = JSON.parse(await readFile(featurePath, 'utf8')) as Record<string, unknown>;
		expect(cleared.category).toBeUndefined();
		expect(cleared.approval).toEqual({ source: 'web-ui' });
		expect(cleared.aiddReport).toEqual({ source: 'aidd-web-report' });
	});
});
