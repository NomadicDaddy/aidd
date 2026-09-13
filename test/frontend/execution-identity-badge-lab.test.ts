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
		const cliCatalog = [...backendOptions.map(({ label }) => label), 'Direct AI'];
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
		// Four identity shapes at natural width, plus every shape in compact mode at each of the
		// four real column budgets — including the model-less shape that exposed the empty chip.
		// Each compact specimen keeps its own production tooltip instead of one group tooltip.
		expect(html.match(/role="group"/g)).toHaveLength(catalogCount + 4 + 16 + 4);
		const constrained = html.slice(
			html.indexOf('Constrained widths'),
			html.indexOf('Status dots'),
		);
		expect(constrained.match(/tabindex="0"/g)).toHaveLength(16);
		expect(constrained.match(/constrained-width comparison/g)).toHaveLength(4);
		expect(constrained).toContain('240px budget');
		expect(constrained).toContain('96px budget');
		for (const cli of cliCatalog) {
			// Catalog chips and their accessible names use the same canonical CLI display label.
			expect(html).toContain(`aria-label="CLI ${cli}`);
		}
		for (const model of executionIdentityModelCatalog) {
			expect(html).toContain(`aria-label="Model ${model}"`);
		}
		for (const reasoningEffort of executionIdentityReasoningCatalog) {
			expect(html).toContain(`aria-label="Reasoning ${reasoningEffort}"`);
		}
		expect(html).toContain('CLI Codex, Model gpt-6-astra, Reasoning high');
		expect(html).toContain('CLI Native, Model glm-5.3, Reasoning medium, Provider Zhipu');
		expect(html).toContain(
			'organization/research-preview-model-with-an-intentionally-long-name',
		);
		expect(html).toContain('aria-label="CLI Ollama"');
		expect(html).not.toContain('style=');
	});
});
