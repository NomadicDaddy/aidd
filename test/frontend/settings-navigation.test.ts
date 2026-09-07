import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
	readSettingsTab,
	settingsTabSearchParameter,
	settingsTabSearchParams,
} from '../../frontend/src/pages/settings/settingsNavigation.ts';

describe('settings navigation', () => {
	test('accepts every public settings group', () => {
		for (const tab of [
			'workspace',
			'run-engine',
			'ai-director',
			'integrations',
			'control-panel',
		] as const) {
			expect(readSettingsTab(tab)).toBe(tab);
		}
	});

	test('falls back to workspace for missing and unknown tab values', () => {
		expect(readSettingsTab(null)).toBe('workspace');
		expect(readSettingsTab('unknown')).toBe('workspace');
		expect(readSettingsTab('runtime')).toBe('workspace');
	});

	test('preserves unrelated query parameters while changing groups', () => {
		const current = new URLSearchParams('tab=integrations&traceData=1&source=docs');
		const next = settingsTabSearchParams(current, 'ai-director');

		expect(next.get('tab')).toBe('ai-director');
		expect(next.get('traceData')).toBe('1');
		expect(next.get('source')).toBe('docs');
		expect(current.get('tab')).toBe('integrations');
	});

	test('uses the clean settings URL for the default workspace group', () => {
		const next = settingsTabSearchParams(
			new URLSearchParams('tab=control-panel&traceData=0'),
			'workspace',
		);

		expect(next.has('tab')).toBe(false);
		expect(next.get('traceData')).toBe('0');
	});

	test('exempts only the settings tab parameter from the unsaved guard', async () => {
		const page = await readFile(
			resolve(import.meta.dir, '../../frontend/src/pages/settings/SettingsPage.tsx'),
			'utf8',
		);

		expect(settingsTabSearchParameter).toBe('tab');
		expect(page).toContain('[settingsTabSearchParameter]');
	});
});
