import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderNamedConsumers(): string {
	const script = [
		"import { createElement as h, Fragment } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Button } from './src/components/ui/button.tsx';",
		"import { RecipeBadgeTooltip } from './src/pages/recipes/RecipeBadgeTooltip.tsx';",
		"const content = h(Fragment, null, h(Button, { variant: 'primary' }, 'Save Overrides'), h(RecipeBadgeTooltip, { content: 'Runs a single step.' }, 'single-step'));",
		'console.log(renderToStaticMarkup(content));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
	return new TextDecoder().decode(result.stdout).trim();
}

describe('pill primitive label wrapping', () => {
	test('keeps the canonical Button label on one line', () => {
		const html = renderNamedConsumers();
		const saveButton = html.match(/<button class="([^"]*)"[^>]*>Save Overrides<\/button>/);

		expect(saveButton?.[1]).toContain('whitespace-nowrap');
	});

	test('keeps the named Audits and Recipes labels on one line', () => {
		const html = renderNamedConsumers();
		const saveButton = html.match(/<button class="([^"]*)"[^>]*>Save Overrides<\/button>/);
		const recipeBadge = html.match(/<span class="([^"]*)">single-step<\/span>/);

		expect(saveButton?.[1]).toContain('whitespace-nowrap');
		expect(recipeBadge?.[1]).toContain('whitespace-nowrap');
	});
});
