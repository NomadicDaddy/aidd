import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(FRONTEND_ROOT, 'src', ...segments)).text();
}

function renderProviderSettings(): string {
	const script = String.raw`
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DirectAiSection } from './src/pages/settings/DirectAiSection.tsx';
import { ProviderConfigSection } from './src/pages/settings/ProviderConfigSection.tsx';
import { createBlankSettings } from './src/pages/settings/settingsUtils.ts';

const emptyProvider = {
	apiKeyConfigured: false,
	baseUrl: null,
	model: null,
	reasoningEffort: null,
};
const form = {
	...createBlankSettings(),
	directAi: {
		...createBlankSettings().directAi,
		enabled: true,
	},
	providers: {
		lmstudio: emptyProvider,
		zhipu: emptyProvider,
	},
};
const setField = () => {};
console.log(renderToStaticMarkup(h('div', null,
	h(ProviderConfigSection, { form, setField }),
	h(DirectAiSection, {
		defaultProvider: form.defaultProvider,
		directAi: form.directAi,
		directorChatAllowFileEdits: false,
		providerNames: Object.keys(form.providers),
		providers: form.providers,
		setField,
	}),
)));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('execution identity vocabulary', () => {
	test('constrains provider choices and renders canonical labels over wire values', () => {
		const html = renderProviderSettings();

		expect(html).toContain('>Use environment or built-in default</option>');
		expect(html).toContain('>Use Default Provider</option>');
		expect(html.match(/<option value="lmstudio">LM Studio<\/option>/g)).toHaveLength(2);
		expect(html.match(/<option value="zhipu">Zhipu<\/option>/g)).toHaveLength(2);
		expect(html).toContain('font-semibold text-foreground">LM Studio</span>');
		expect(html).toContain('font-mono text-xs text-muted-foreground">lmstudio</span>');
		expect(html).not.toContain('placeholder="zhipu"');
	});

	test('uses CLI on settings and project-run surfaces while retaining internal field names', async () => {
		const [defaults, matrix, disclosure, fields, profile, localRuns] = await Promise.all([
			read('pages', 'settings', 'GeneralDefaultsSection.tsx'),
			read('pages', 'settings', 'BackendDefaultsTable.tsx'),
			read('pages', 'settings', 'BackendDefaultsDisclosureRow.tsx'),
			read('pages', 'settings', 'BackendDefaultFields.tsx'),
			read('pages', 'director', 'DirectorProfileSection.tsx'),
			read('components', 'shared', 'local-aidd-history', 'LocalRunsTable.tsx'),
		]);

		expect(defaults).toContain('label="Default CLI"');
		expect(defaults).toContain('the CLI Matrix (Run Engine tab)');
		expect(matrix).toContain('title="CLI Matrix"');
		expect(matrix).toContain('CLI &amp; Status');
		expect(matrix).toContain('backendLabel(backend)');
		expect(disclosure).toContain('${cliLabel} CLI defaults');
		expect(disclosure).toContain('keep this CLI open');
		expect(fields).toContain('const cliLabel = backendLabel(backend)');
		expect(fields).not.toContain('aria-label={`${backend}');
		expect(profile).toContain('label="CLI"');
		expect(profile).not.toContain('label="Backend"');
		expect(localRuns).toContain('label="CLI"');
		expect(localRuns).toContain('label: backendLabel(backend)');
	});
});
