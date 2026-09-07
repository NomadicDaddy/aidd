import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { discardSettingsChangesAndProceed } from '../../frontend/src/pages/settings/settingsDiscardNavigation.ts';

const SETTINGS_PAGE = resolve(
	import.meta.dir,
	'../../frontend/src/pages/settings/SettingsPage.tsx',
);

describe('settings discard navigation', () => {
	test('discards the draft before continuing the blocked navigation', () => {
		const calls: string[] = [];

		discardSettingsChangesAndProceed(
			() => calls.push('discard'),
			() => calls.push('proceed'),
		);

		expect(calls).toEqual(['discard', 'proceed']);
	});

	test('still discards when the blocker has no continuation', () => {
		let discarded = false;

		discardSettingsChangesAndProceed(() => {
			discarded = true;
		}, undefined);

		expect(discarded).toBe(true);
	});

	test('wires the rendered navigation dialog to the ordered discard helper', async () => {
		const page = await Bun.file(SETTINGS_PAGE).text();

		expect(page).toContain('discardSettingsChangesAndProceed(discardChanges, blocker.proceed)');
		expect(page).toContain('onClose={() => blocker.reset?.()}');
	});
});
