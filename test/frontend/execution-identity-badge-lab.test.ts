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
		"import { MemoryRouter } from 'react-router-dom';",
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
	test('renders every built-in CLI, model, and reasoning combination', () => {
		const html = renderBadgeLab();
		const cliCount = backendOptions.length + 1;
		const combinationCount =
			cliCount *
			executionIdentityModelCatalog.length *
			executionIdentityReasoningCatalog.length;

		expect(html).toContain('Execution Identity Badge Lab');
		expect(html).toContain(`${combinationCount} combinations`);
		expect(html.match(/role="group"/g)).toHaveLength(combinationCount + cliCount);
		expect(html).toContain('CLI direct, Model glm-5.2, Reasoning high');
		expect(html).toContain('CLI codex, Model gpt-5.6, Reasoning xhigh');
	});
});
