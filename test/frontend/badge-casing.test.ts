import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderBadge(children: string, casing?: 'preserve' | 'title'): string {
	const props = casing ? { casing } : {};
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Badge } from './src/components/ui/badge.tsx';",
		`console.log(renderToStaticMarkup(createElement(Badge, ${JSON.stringify(props)}, ${JSON.stringify(children)})));`,
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('Badge casing', () => {
	test('preserves machine-supplied values by default', () => {
		for (const value of ['claude-code', 'killed', 'gpt-5.6-sol', 'package.json']) {
			const html = renderBadge(value);

			expect(html).toContain('normal-case');
			expect(html).toContain(`>${value}</span>`);
			expect(html).not.toContain(' capitalize');
		}
	});

	test('keeps title casing as an explicit human-label opt-in', () => {
		const html = renderBadge('human label', 'title');

		expect(html).toContain(' capitalize');
		expect(html).not.toContain('normal-case');
		expect(html).toContain('>human label</span>');
	});

	test('resets inherited label tracking at the rendered badge boundary', () => {
		expect(renderBadge('Not set')).toContain('font-sans tracking-normal');
	});
});
