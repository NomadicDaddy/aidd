import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderMeasure(): { className: string; markup: string } {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Card } from './src/components/ui/card.tsx';",
		"import { tableMeasureClass } from './src/lib/tableStyles.ts';",
		"const table = createElement('table', { className: 'min-w-[1240px]' });",
		'const card = createElement(Card, { className: tableMeasureClass }, table);',
		'const markup = renderToStaticMarkup(card);',
		"console.log(tableMeasureClass + '\\n' + markup);",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	const [className = '', ...markupLines] = new TextDecoder()
		.decode(result.stdout)
		.trim()
		.split('\n');
	return { className, markup: markupLines.join('\n') };
}

describe('shared table measure', () => {
	test('rests at 80rem, grows from intrinsic content, and stops at the available rail', () => {
		const { className } = renderMeasure();

		expect(className).toBe('w-max min-w-[min(100%,80rem)] max-w-full');
		expect(className).not.toContain('max-w-[80rem]');
	});

	test('survives the rendered Card boundary without replacing a table floor', () => {
		const { markup } = renderMeasure();

		expect(markup).toContain('w-max min-w-[min(100%,80rem)] max-w-full');
		expect(markup).toContain('min-w-[1240px]');
	});
});
