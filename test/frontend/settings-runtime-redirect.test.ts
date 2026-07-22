import { describe, expect, test } from 'bun:test';

import {
	buildSettingsRestartUrl,
	settingsRestartTargetChanged,
} from '../../frontend/src/pages/settings/runtimeRedirect.ts';

describe('settings runtime restart redirect helpers', () => {
	test('detects port changes', () => {
		expect(
			settingsRestartTargetChanged(
				{ hostname: '127.0.0.1', port: 3210 },
				{ hostname: '127.0.0.1', port: 4555 }
			)
		).toBe(true);
		expect(
			settingsRestartTargetChanged(
				{ hostname: '127.0.0.1', port: 3210 },
				{ hostname: '127.0.0.1', port: 3210 }
			)
		).toBe(false);
		expect(
			settingsRestartTargetChanged(
				{ hostname: '127.0.0.1', port: 3210 },
				{ hostname: 'localhost', port: 3210 }
			)
		).toBe(false);
	});

	test('redirects to settings on the saved port and clears transient URL state', () => {
		expect(
			buildSettingsRestartUrl('http://127.0.0.1:3210/settings?tab=runtime#top', {
				hostname: '127.0.0.1',
				port: 4555,
			})
		).toBe('http://127.0.0.1:4555/settings');
	});

	test('keeps the current browser hostname for wildcard listeners', () => {
		expect(
			buildSettingsRestartUrl('http://localhost:3210/settings', {
				hostname: '0.0.0.0',
				port: 4555,
			})
		).toBe('http://localhost:4555/settings');
	});
});
