import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
	type ConsoleDisclosure,
	consoleSourceId,
	initialDisclosure,
	toggleDisclosure,
} from '../../frontend/src/pages/pipelineSessions/stepConsoleDisclosure.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const RUN_ID = 'run-42';

function source(...segments: string[]): string {
	return readFileSync(join(FRONTEND_ROOT, 'src', ...segments), 'utf-8');
}

function renderToggleLabel(streaming: boolean): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ConsoleToggleLabel } from './src/pages/pipelineSessions/StepRunConsole.tsx';",
		`console.log(renderToStaticMarkup(createElement(ConsoleToggleLabel, { streaming: ${String(streaming)} })));`,
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

describe('step run console disclosure', () => {
	test('collapsed: a finished step opens closed and reads nothing', () => {
		const state = initialDisclosure('completed');

		expect(state).toEqual({ everOpened: false, open: false });
		// The whole point of the lazy path: a session of collapsed steps requests no transcripts.
		expect(consoleSourceId(state, RUN_ID)).toBeUndefined();
	});

	test('a running step is initially open and reading straight away', () => {
		const state = initialDisclosure('running');

		expect(state).toEqual({ everOpened: true, open: true });
		expect(consoleSourceId(state, RUN_ID)).toBe(RUN_ID);
	});

	test('first open: the transcript source appears exactly once the disclosure does', () => {
		const opened = toggleDisclosure(initialDisclosure('completed'));

		expect(opened.open).toBe(true);
		expect(consoleSourceId(opened, RUN_ID)).toBe(RUN_ID);
	});

	test('reopened: closing keeps the subscription so the collapsed dot stays truthful', () => {
		const opened = toggleDisclosure(initialDisclosure('completed'));
		const closed = toggleDisclosure(opened);
		const reopened = toggleDisclosure(closed);

		expect(closed.open).toBe(false);
		expect(closed.everOpened).toBe(true);
		expect(consoleSourceId(closed, RUN_ID)).toBe(RUN_ID);
		expect(reopened.open).toBe(true);
		expect(consoleSourceId(reopened, RUN_ID)).toBe(RUN_ID);
	});

	test('a step with no run never names a source, however often it is toggled', () => {
		let state: ConsoleDisclosure = initialDisclosure('completed');
		for (let i = 0; i < 4; i += 1) {
			state = toggleDisclosure(state);
			expect(consoleSourceId(state, null)).toBeUndefined();
		}
	});

	test('actively streaming: the toggle label carries the pulsing dot', () => {
		const streaming = renderToggleLabel(true);
		const idle = renderToggleLabel(false);

		expect(streaming).toContain('Console');
		expect(streaming).toContain('status-pulse');
		expect(idle).toContain('Console');
		expect(idle).not.toContain('status-pulse');
	});

	test('the console reads isStreaming directly and keeps no mirrored copy', () => {
		const console_ = source('pages', 'pipelineSessions', 'StepRunConsole.tsx');
		const body = source('pages', 'pipelineSessions', 'RunConsoleBody.tsx');

		expect(console_).toContain('<ConsoleToggleLabel streaming={output.isStreaming} />');
		// The finding: a child effect calling back up so a sibling could render the dot.
		expect(console_).not.toContain('onStreamingChange');
		expect(console_).not.toContain('useEffect');
		expect(console_).not.toContain('setStreaming');
		// The body is a projection of the output its owner holds; it must not subscribe again or
		// report upward, which is what would recreate the second authority.
		expect(body).not.toContain('useRunLiveOutput(');
		expect(body).not.toContain('useEffect');
		expect(body).not.toMatch(/\bon[A-Z]\w*Change\b/);
	});
});
