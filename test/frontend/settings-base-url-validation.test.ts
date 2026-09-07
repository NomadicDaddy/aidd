import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	directAiBaseUrlValidationError,
	providerBaseUrlValidationError,
} from '../../frontend/src/pages/settings/settingsBaseUrlValidation.ts';
import { settingsSaveBlockReason } from '../../frontend/src/pages/settings/settingsSaveValidation.ts';
import { createBlankSettings } from '../../frontend/src/pages/settings/settingsUtils.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

function render(imports: string, expression: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		imports,
		`console.log(renderToStaticMarkup(${expression}));`,
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('Settings provider base URL validation', () => {
	test('renders distinct keep, clear and replacement drafts without exposing a saved key', () => {
		for (const apiKey of [undefined, '', 'test-replacement']) {
			const form = createBlankSettings();
			form.defaultProvider = 'zhipu';
			form.providers.zhipu = {
				apiKeyConfigured: true,
				baseUrl: null,
				model: null,
				reasoningEffort: null,
				...(apiKey === undefined ? {} : { apiKey }),
			};
			const html = render(
				"import { ProviderConfigSection } from './src/pages/settings/ProviderConfigSection.tsx';",
				`createElement(ProviderConfigSection, { form: ${JSON.stringify(form)}, setField: () => undefined })`,
			);
			expect(html).toContain('type="password"');
			expect(html).toContain('role="status"');
			if (apiKey === undefined) {
				expect(html).toContain('Keeping the saved key.');
				expect(html).not.toContain('Undo key change');
			} else {
				expect(html).toContain('Undo key change');
				expect(html).toContain(
					apiKey === ''
						? 'Saved key will be cleared when you save.'
						: 'New key will be used when you save.',
				);
			}
			if (apiKey === '') {
				expect(html).toContain('Saved key marked for removal');
				expect(html).not.toContain('leave blank to keep');
			}
		}
	});

	test('accepts HTTPS and loopback HTTP while rejecting malformed and non-HTTP URLs', () => {
		expect(directAiBaseUrlValidationError('https://api.example.com/v1')).toBeNull();
		expect(providerBaseUrlValidationError('http://127.0.0.1:11434/v1', 'ollama')).toBeNull();
		expect(directAiBaseUrlValidationError('not a url')).toBe(
			'Direct AI base URL is not a valid URL: not a url',
		);
		expect(providerBaseUrlValidationError('file:///etc/passwd', 'zhipu')).toBe(
			'Provider "zhipu" base URL must use http or https (got "file").',
		);
	});

	test('blocks Settings save for Direct AI and provider URL errors', () => {
		const directAiForm = createBlankSettings();
		directAiForm.directAi.baseUrl = 'not a url';
		expect(settingsSaveBlockReason(directAiForm, null, null, false)).toContain(
			'Direct AI base URL',
		);

		const providerForm = createBlankSettings();
		providerForm.providers.zhipu = {
			apiKeyConfigured: false,
			baseUrl: 'ftp://provider.example.com',
			model: 'glm-5.3',
			reasoningEffort: null,
		};
		expect(settingsSaveBlockReason(providerForm, null, null, false)).toContain(
			'Provider "zhipu" base URL',
		);
	});

	test('renders linked errors on the Direct AI and provider URL inputs', () => {
		const form = createBlankSettings();
		form.defaultProvider = 'zhipu';
		form.directAi = { ...form.directAi, baseUrl: 'not a url', enabled: true };
		form.providers.zhipu = {
			apiKeyConfigured: false,
			baseUrl: 'file:///etc/passwd',
			model: 'glm-5.3',
			reasoningEffort: null,
		};
		const serialized = JSON.stringify(form);
		const directAi = render(
			"import { DirectAiSection } from './src/pages/settings/DirectAiSection.tsx';",
			`createElement(DirectAiSection, {
				defaultProvider: ${serialized}.defaultProvider,
				directAi: ${serialized}.directAi,
				directorChatAllowFileEdits: false,
				providerNames: Object.keys(${serialized}.providers),
				providers: ${serialized}.providers,
				setField: () => undefined,
			})`,
		);
		const providers = render(
			"import { ProviderConfigSection } from './src/pages/settings/ProviderConfigSection.tsx';",
			`createElement(ProviderConfigSection, {
				form: ${serialized},
				setField: () => undefined,
			})`,
		);

		for (const html of [directAi, providers]) {
			expect(html).toContain('aria-invalid="true"');
			expect(html).toContain('aria-describedby=');
			expect(html).toContain('role="alert"');
		}
		expect(directAi).toContain('Direct AI base URL is not a valid URL');
		expect(providers).toContain('Provider &quot;zhipu&quot; base URL must use http or https');
		expect(directAi).toMatch(/Base URL<\/label><input[^>]*aria-invalid="true"/u);
		expect(providers).toMatch(/Base URL<\/label><input[^>]*aria-invalid="true"/u);
	});
});
