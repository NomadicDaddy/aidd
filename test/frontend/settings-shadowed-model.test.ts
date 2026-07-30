import { describe, expect, test } from 'bun:test';

import {
	createBlankSettings,
	shadowingBackendModel,
} from '../../frontend/src/pages/settings/settingsUtils.ts';

// Regression: with cli=codex, backends.codex.model="gpt-5.6", and the shared Default Model set to
// "gpt-5.6-sol", an override-free launch resolved gpt-5.6 (backend model outranks shared) while
// the Settings UI gave no indication the shared field was dead. The hint exists so that config
// state is visible before it costs a run.
describe('shadowingBackendModel', () => {
	test('reports the default CLI backend model that outranks the shared default', () => {
		const form = createBlankSettings();
		form.cli = 'codex';
		form.model = 'gpt-5.6-sol';
		form.backends = {
			codex: {
				idleNudgeTimeoutSeconds: null,
				idleTimeoutSeconds: null,
				model: 'gpt-5.6',
				reasoningEffort: null,
			},
		};
		expect(shadowingBackendModel(form)).toBe('gpt-5.6');
	});

	test('returns null when the shared default model is unset', () => {
		const form = createBlankSettings();
		form.cli = 'codex';
		form.backends = {
			codex: {
				idleNudgeTimeoutSeconds: null,
				idleTimeoutSeconds: null,
				model: 'gpt-5.6',
				reasoningEffort: null,
			},
		};
		expect(shadowingBackendModel(form)).toBeNull();
	});

	test('returns null when the default CLI row has no model of its own', () => {
		const form = createBlankSettings();
		form.cli = 'codex';
		form.model = 'gpt-5.6-sol';
		form.backends = {
			// Another backend's model never shadows the default CLI's launches.
			native: {
				idleNudgeTimeoutSeconds: null,
				idleTimeoutSeconds: null,
				model: 'glm-5.2',
				reasoningEffort: null,
			},
		};
		expect(shadowingBackendModel(form)).toBeNull();
	});

	test('still reports shadowing when both values are identical', () => {
		// Identical values resolve the same either way, but the row still deadens future edits
		// to the shared field — the helper reports it; display-layer policy decides visibility.
		const form = createBlankSettings();
		form.cli = 'native';
		form.model = 'glm-5.2';
		form.backends = {
			native: {
				idleNudgeTimeoutSeconds: null,
				idleTimeoutSeconds: null,
				model: 'glm-5.2',
				reasoningEffort: null,
			},
		};
		expect(shadowingBackendModel(form)).toBe('glm-5.2');
	});
});
