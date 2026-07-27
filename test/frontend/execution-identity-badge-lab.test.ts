import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { backendOptions } from '../../frontend/src/lib/backends.ts';
import {
	executionIdentityModelCatalog,
	executionIdentityReasoningCatalog,
} from '../../frontend/src/lib/executionIdentity.ts';

function renderBadgeLab(): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { ExecutionIdentityBadgeLabPage } from './src/pages/settings/ExecutionIdentityBadgeLabPage.tsx';",
		'const page = createElement(MemoryRouter, null, createElement(ExecutionIdentityBadgeLabPage));',
		'console.log(renderToStaticMarkup(page));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('ExecutionIdentityBadgeLabPage', () => {
	test('renders representative identities and every catalog value once', () => {
		const html = renderBadgeLab();
		const cliCatalog = [...backendOptions.map(({ value }) => value), 'direct'];
		const cliCount = backendOptions.length + 1;
		const catalogCount =
			cliCount +
			executionIdentityModelCatalog.length +
			executionIdentityReasoningCatalog.length;

		expect(html).toContain('Execution Identity Badge Lab');
		expect(html).toContain(
			`${cliCount} CLIs · ${executionIdentityModelCatalog.length} models · ${executionIdentityReasoningCatalog.length} reasoning levels`,
		);
		expect(html).not.toContain('combinations');
		expect(html.match(/role="group"/g)).toHaveLength(catalogCount + 4);
		for (const cli of cliCatalog) {
			expect(html).toContain(`aria-label="CLI ${cli}"`);
		}
		for (const model of executionIdentityModelCatalog) {
			expect(html).toContain(`aria-label="Model ${model}"`);
		}
		for (const reasoningEffort of executionIdentityReasoningCatalog) {
			expect(html).toContain(`aria-label="Reasoning ${reasoningEffort}"`);
		}
		expect(html).toContain('CLI codex, Model gpt-5.6-sol, Reasoning high');
		expect(html).toContain('CLI native, Model glm-5.2, Reasoning medium, Provider zhipu');
		expect(html).toContain(
			'organization/research-preview-model-with-an-intentionally-long-name',
		);
		expect(html).toContain('aria-label="CLI ollama"');
		expect(html).not.toContain('style=');
	});
});
