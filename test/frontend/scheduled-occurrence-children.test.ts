import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderOccurrenceChildren(): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { ScheduledOccurrenceChildren } from './src/pages/scheduled/ScheduledOccurrenceChildren.tsx';

const children = [
	...Array.from({ length: 5 }, (_, index) => ({
		id: 'run_' + (index + 1),
		projectPath: 'D:\\applications\\project-' + (index + 1),
		status: ['completed', 'failed', 'running', 'waiting_approval', 'killed'][index],
		type: 'run',
	})),
	...Array.from({ length: 4 }, (_, index) => ({
		id: 'pipe_' + (index + 1),
		projectPath: 'D:\\applications\\project-' + (index + 1),
		status: ['completed', 'completed_with_failures', 'failed', 'stopped'][index],
		type: 'session',
	})),
	{ id: 'cycle_1', projectPath: null, status: 'completed', type: 'cycle' },
];

console.log(
	renderToStaticMarkup(
		createElement(
			MemoryRouter,
			null,
			createElement(ScheduledOccurrenceChildren, { children }),
		),
	),
);
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout);
}

test('Scheduled occurrence children render grouped counts and collapsed tails', () => {
	const markup = renderOccurrenceChildren();

	expect(markup).toContain('5 runs');
	expect(markup).toContain('4 sessions');
	expect(markup).toContain('1 cycle');
	expect(markup.match(/<h3/g) ?? []).toHaveLength(0);
	expect(markup.match(/>Show all</g)).toHaveLength(2);
	expect(markup).not.toContain('Show all 1 cycle');
	expect(markup).not.toContain('run run_');
	expect(markup).not.toContain('session pipe_');
	expect(markup.match(/<details/g)).toHaveLength(2);
	expect(markup.match(/<a /g)).toHaveLength(10);
	expect(markup.match(/bg-emerald-500/g)).toHaveLength(3);
	expect(markup.match(/bg-red-500/g)).toHaveLength(3);
	expect(markup.match(/bg-teal-500/g)).toHaveLength(1);
	expect(markup.match(/bg-amber-500/g)).toHaveLength(3);
	expect(markup.match(/font-mono/g)).toHaveLength(10);
	expect(markup.match(/tabular-nums/g)).toHaveLength(5);
	expect(markup).toContain(
		'text-2xs font-medium tracking-wide uppercase text-muted-foreground tabular-nums">5 runs</p>',
	);
	expect(markup).toContain('Completed: </span>run_1');
	expect(markup).toContain('Failed: </span>run_2');
	expect(markup.match(/group-open:rotate-90/g)).toHaveLength(2);
	expect(markup.match(/focus-visible:outline-2/g)).toHaveLength(2);
	expect(markup.indexOf('run_5')).toBeLessThan(markup.indexOf('pipe_1'));
	expect(markup.indexOf('pipe_4')).toBeLessThan(markup.indexOf('cycle_1'));
});
