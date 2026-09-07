import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	beginningWindow,
	describeTranscriptWindow,
	formatTranscriptPosition,
	newerWindow,
	olderWindow,
} from '../../frontend/src/pages/runs/liveConsoleNavigation.ts';

const MIB = 1024 * 1024;
const frontendRoot = resolve(import.meta.dir, '../../frontend');

function renderWindowNav(): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveConsoleWindowNav } from './src/pages/runs/LiveConsoleWindowNav.tsx';

console.log(renderToStaticMarkup(createElement(LiveConsoleWindowNav, {
	isBrowsing: true,
	isLoading: true,
	onRequest: () => undefined,
	onReturnLive: () => undefined,
	window: {
		endByte: 6 * 1024 * 1024,
		startByte: 4 * 1024 * 1024,
		totalBytes: 17 * 1024 * 1024,
		windowLimitBytes: 2 * 1024 * 1024,
	},
})));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString();
}

describe('run output window navigation', () => {
	test('derives a tail position and bounded deliberate page requests', () => {
		const tail = describeTranscriptWindow({
			endByte: undefined,
			message: 'tail\n',
			startByte: undefined,
			totalBytes: 17 * MIB,
			windowLimitBytes: undefined,
		});
		expect(tail).toEqual({
			endByte: 17 * MIB,
			startByte: 17 * MIB - 5,
			totalBytes: 17 * MIB,
			windowLimitBytes: 2 * MIB,
		});
		expect(beginningWindow(tail)).toEqual({ endByte: 2 * MIB, startByte: 0 });

		const middle = { ...tail, endByte: 6 * MIB, startByte: 4 * MIB };
		expect(olderWindow(middle)).toEqual({ endByte: 4 * MIB, startByte: 2 * MIB });
		expect(newerWindow(middle)).toEqual({ endByte: 8 * MIB, startByte: 6 * MIB });
		expect(formatTranscriptPosition(middle)).toBe('Showing 4 MB–6 MB of 17 MB');
	});

	test('renders exact position, bounded navigation, and an explicit return to live', () => {
		const html = renderWindowNav();
		expect(html).toContain('Showing 4 MB–6 MB of 17 MB · Earlier window');
		expect(html).toContain('Beginning');
		expect(html).toContain('Older');
		expect(html).toContain('Newer');
		expect(html).toContain('Return to live');
		expect(html).toContain('aria-live="polite"');
		const returnButtonStart = html.lastIndexOf('<button', html.indexOf('Return to live'));
		const returnButton = html.slice(returnButtonStart, html.indexOf('Return to live'));
		expect(returnButton).not.toMatch(/\sdisabled(?:=|>)/);
	});
});
