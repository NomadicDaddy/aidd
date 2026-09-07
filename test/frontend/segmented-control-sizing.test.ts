import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderSegmentedControl(): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SegmentedControl } from './src/components/ui/segmented-control.tsx';

console.log(renderToStaticMarkup(createElement(SegmentedControl, {
	ariaLabel: 'Layout',
	onChange: () => {},
	options: [
		{ label: 'Cards', value: 'cards' },
		{ label: 'Table', value: 'table' },
	],
	value: 'cards',
})));
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

describe('SegmentedControl intrinsic sizing', () => {
	test('owns content width in flex and grid placement without weakening overflow safety', () => {
		const markup = renderSegmentedControl();
		const trackClass = /<div[^>]*class="([^"]+)"[^>]*role="group"/u.exec(markup)?.[1];
		const trackClasses = trackClass?.split(' ');

		expect(trackClasses).toContain('inline-flex');
		expect(trackClasses).toContain('w-fit');
		expect(trackClasses).toContain('max-w-full');
		expect(trackClasses).toContain('max-sm:w-full');
		expect(trackClasses).not.toContain('w-full');
	});
});
