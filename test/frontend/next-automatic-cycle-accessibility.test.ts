import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderNextAutomaticCycleStatus(state: 'active' | 'paused'): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { NextAutomaticCycleStatus } from './src/pages/director/NextAutomaticCycle.tsx';",
		'const task = {',
		"\tarchivedAt: null, createdAt: 0, id: 'director-task', name: 'Director cycle',",
		"\tnextRunAt: Date.UTC(2026, 8, 2, 5), projects: [], projectScope: 'none',",
		"\tschedule: { expression: '0 */12 * * *', kind: 'cron', timezone: 'America/Chicago' },",
		`\tstate: ${JSON.stringify(state)}, systemKey: 'director', target: { type: 'director' }, updatedAt: 0,`,
		'};',
		'const status = createElement(NextAutomaticCycleStatus, { task });',
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, status)));',
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

describe('Next automatic Director cycle accessibility', () => {
	test('announces schedule changes as one polite status', () => {
		for (const state of ['active', 'paused'] as const) {
			const rendered = renderNextAutomaticCycleStatus(state);

			expect(rendered).toContain('aria-live="polite"');
			expect(rendered).toContain('aria-atomic="true"');
		}
	});

	test('distinguishes the inline Scheduled link without relying on colour', () => {
		const rendered = renderNextAutomaticCycleStatus('active');

		expect(rendered).toContain('class="text-accent underline underline-offset-4"');
		expect(rendered).toContain('>Manage on Scheduled</a>');
	});
});
