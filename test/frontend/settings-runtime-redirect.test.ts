import { describe, expect, test } from 'bun:test';

import {
	buildSettingsRestartUrl,
	settingsRestartTargetChanged,
} from '../../frontend/src/pages/settings/runtimeRedirect.ts';

describe('settings runtime restart redirect helpers', () => {
	test('detects listener changes', () => {
		expect(
			settingsRestartTargetChanged(
				{ allowRemote: false, hostname: '127.0.0.1', port: 3210 },
				{ allowRemote: false, hostname: '127.0.0.1', port: 4555 },
			),
		).toBe(true);
		expect(
			settingsRestartTargetChanged(
				{ allowRemote: false, hostname: '127.0.0.1', port: 3210 },
				{ allowRemote: false, hostname: 'localhost', port: 3210 },
			),
		).toBe(true);
		expect(
			settingsRestartTargetChanged(
				{ allowRemote: false, hostname: '127.0.0.1', port: 3210 },
				{ allowRemote: true, hostname: '127.0.0.1', port: 3210 },
			),
		).toBe(true);
	});

	test('ignores settings saves that keep the listener target unchanged', () => {
		expect(
			settingsRestartTargetChanged(
				{ allowRemote: false, hostname: '127.0.0.1', port: 3210 },
				{ allowRemote: false, hostname: ' 127.0.0.1 ', port: 3210 },
			),
		).toBe(false);
	});

	test('redirects to settings on the saved port and clears transient URL state', () => {
		expect(
			buildSettingsRestartUrl('http://127.0.0.1:3210/settings?tab=runtime#top', {
				allowRemote: false,
				hostname: '127.0.0.1',
				port: 4555,
			}),
		).toBe('http://127.0.0.1:4555/settings');
	});

	test('keeps the current browser hostname for wildcard listeners', () => {
		expect(
			buildSettingsRestartUrl('http://localhost:3210/settings', {
				allowRemote: true,
				hostname: '0.0.0.0',
				port: 4555,
			}),
		).toBe('http://localhost:4555/settings');
	});

	test('redirects to the configured hostname after a binding change', () => {
		expect(
			buildSettingsRestartUrl('http://127.0.0.1:3210/settings?tab=control-panel', {
				allowRemote: false,
				hostname: 'localhost',
				port: 3210,
			}),
		).toBe('http://localhost:3210/settings');
	});
});
