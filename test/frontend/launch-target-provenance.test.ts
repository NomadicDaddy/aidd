import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { reconstructedRunCommand } from '../../backend/src/services/run/commandMetadata.ts';
import { launchTargetDefaultDisplay } from '../../frontend/src/components/shared/launchTargetControlModel.ts';
import {
	createBlankSettings,
	emptyBackendDefault,
	shadowingBackendModel,
} from '../../frontend/src/pages/settings/settingsUtils.ts';

function renderLaunchTargetSurfaces(): {
	clearedControl: string;
	director: string;
	general: string;
	overriddenControl: string;
} {
	const script = String.raw`
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { LaunchTargetControl } from './src/components/shared/LaunchTargetControl.tsx';
import { DirectorProfileSection } from './src/pages/director/DirectorProfileSection.tsx';
import { GeneralDefaultsSection } from './src/pages/settings/GeneralDefaultsSection.tsx';
import { createBlankSettings } from './src/pages/settings/settingsUtils.ts';

const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
const launchDefaults = (backend, model, modelSource, reasoningEffort = 'high') => ({
	effective: {
		backend,
		backendSource: 'config',
		model,
		modelSource,
		provider: undefined,
		reasoningEffort,
	},
	projectConfigApplied: false,
	triumvirate: {
		exec: { backend: null, model: null },
		overseer: { backend: null, model: null },
		secondary: { backend: null, model: null },
	},
});
client.setQueryData(['launch-defaults', null, 'interview', null], launchDefaults('codex', 'backend-model', 'backend-config'));
client.setQueryData(['launch-defaults', null, 'coding', null], launchDefaults('codex', 'code-model', 'mode-config'));
client.setQueryData(['launch-defaults', null, 'audit', null], launchDefaults('codex', 'audit-model', 'mode-config'));
client.setQueryData(['launch-defaults', null, 'interview', 'native'], launchDefaults('native', 'native-model', 'backend-config'));
client.setQueryData(['launch-defaults', 'D:/applications/aidd', 'coding', null], launchDefaults('codex', 'codex-model', 'backend-config', 'medium'));
client.setQueryData(['launch-defaults', 'D:/applications/aidd', 'coding', 'native'], launchDefaults('native', 'native-model', 'backend-config', 'high'));
const render = (element) => renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, null, element)));
const form = { ...createBlankSettings(), backends: { codex: { model: 'backend-model' } } };
console.log(JSON.stringify({
	clearedControl: render(h(LaunchTargetControl, { mode: 'coding', onChange: () => {}, projectDir: 'D:/applications/aidd', value: {} })),
	director: render(h(DirectorProfileSection, { dirty: false, form: { backend: 'native', model: null }, onChange: () => {}, onSave: () => {}, pending: false })),
	general: render(h(GeneralDefaultsSection, { form, setField: () => {} })),
	overriddenControl: render(h(LaunchTargetControl, { mode: 'coding', onChange: () => {}, projectDir: 'D:/applications/aidd', value: { backend: 'native' } })),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as {
		clearedControl: string;
		director: string;
		general: string;
		overriddenControl: string;
	};
}

describe('effective launch-target display', () => {
	test('keeps the value and provenance together', () => {
		const display = launchTargetDefaultDisplay({
			backend: 'codex',
			isLoading: false,
			model: 'gpt-5.6-sol',
			modelSource: 'backend-config',
			provider: 'zhipu',
		});

		expect(display.modelPlaceholder).toBe('Effective (gpt-5.6-sol)');
		expect(display.modelProvenance).toBe(
			'Effective model: gpt-5.6-sol · CLI default from config · CLI Codex · Provider Zhipu',
		);
	});

	test('does not call a backend default shadowing when the shared override is blank', () => {
		const form = createBlankSettings();
		form.cli = 'codex';
		form.backends.codex = { ...emptyBackendDefault(), model: 'backend-model' };

		expect(form.model).toBeNull();
		expect(shadowingBackendModel(form)).toBeNull();
	});

	test('renders effective placeholders and provenance through the real settings fields', () => {
		const rendered = renderLaunchTargetSurfaces();

		expect(rendered.general).toContain('placeholder="Effective (backend-model)"');
		expect(rendered.general).toContain('placeholder="Effective (code-model)"');
		expect(rendered.general).toContain('placeholder="Effective (audit-model)"');
		expect(rendered.general).toContain(
			'Effective model: <span class="font-mono">backend-model</span> · CLI default from config · CLI Codex',
		);
		expect(rendered.director).toContain('placeholder="Effective (native-model)"');
		expect(rendered.director).toContain(
			'Effective model: <span class="font-mono">native-model</span> · CLI default from config · CLI Native',
		);
	});

	test('re-resolves shared control defaults for a CLI override and returns on reset', () => {
		const rendered = renderLaunchTargetSurfaces();
		const command = reconstructedRunCommand({
			backend: 'native',
			mode: 'coding',
			model: 'native-model',
			projectPath: 'D:/applications/aidd',
			reasoningEffort: 'high',
		});

		expect(command?.args).toContain('native');
		expect(command?.args).toContain('native-model');
		expect(command?.args).toContain('high');
		expect(rendered.overriddenControl).toContain('Native');
		expect(rendered.overriddenControl).toContain('native-model');
		expect(rendered.overriddenControl).toContain('high');
		expect(rendered.overriddenControl).not.toContain('codex-model');
		expect(rendered.clearedControl).toContain('Codex');
		expect(rendered.clearedControl).toContain('codex-model');
		expect(rendered.clearedControl).toContain('medium');
		expect(rendered.clearedControl).not.toContain('native-model');
	});
});
