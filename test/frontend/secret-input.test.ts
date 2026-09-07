import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dir, '../..');

function renderSecret(value: string, disabled = false): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { SecretInput } from './src/components/ui/secret-input.tsx';",
		`console.log(renderToStaticMarkup(createElement(SecretInput, {
			disabled: ${disabled},
			onChange: () => {},
			secretName: 'API key',
			value: ${JSON.stringify(value)},
		})));`,
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(repoRoot, 'frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('shared secret input', () => {
	test('masks machine-valued secrets and exposes copy and reveal actions', () => {
		const html = renderSecret('not-a-real-secret');

		expect(html).toContain('type="password"');
		expect(html).toContain('font-mono');
		expect(html).toContain('aria-label="Copy API key"');
		expect(html).toContain('aria-label="Reveal API key"');
		expect(html).toContain('aria-pressed="false"');
		expect(html).not.toContain('disabled=""');
	});

	test('omits inert actions until there is a local value to copy or reveal', () => {
		const html = renderSecret('');
		const disabledHtml = renderSecret('not-a-real-secret', true);

		expect(html).not.toContain('aria-label="Copy API key"');
		expect(html).not.toContain('aria-label="Reveal API key"');
		expect(disabledHtml).not.toContain('aria-label="Copy API key"');
		expect(disabledHtml).not.toContain('aria-label="Reveal API key"');
		expect(disabledHtml.match(/disabled=""/g)).toHaveLength(1);
	});

	test('masks on focus exit and copies without changing visibility', async () => {
		const source = await Bun.file(
			resolve(repoRoot, 'frontend/src/components/ui/secret-input.tsx'),
		).text();
		const copyHandler = source.slice(
			source.indexOf('function copySecret'),
			source.indexOf('\n\treturn ('),
		);

		expect(source).toContain('onBlurCapture=');
		expect(source).toContain('setRevealed(false)');
		expect(copyHandler).toContain('navigator.clipboard');
		expect(copyHandler).toContain('.writeText(value)');
		expect(copyHandler).not.toContain('setRevealed');
	});

	test('owns every password field through one shared component', async () => {
		const relativePaths = [
			'frontend/src/components/shared/AuthTokenDialog.tsx',
			'frontend/src/pages/settings/ProviderConfigSection.tsx',
			'frontend/src/pages/settings/TelegramChannelSection.tsx',
		];
		const sources = await Promise.all(
			relativePaths.map((path) => Bun.file(resolve(repoRoot, path)).text()),
		);

		for (const source of sources) {
			expect(source).toContain('<SecretInput');
			expect(source).not.toContain('type="password"');
		}
	});
});
