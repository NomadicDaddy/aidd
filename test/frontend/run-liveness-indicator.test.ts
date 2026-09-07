import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * The liveness dot only ever renders while a run is executing, which is why the design sweep never
 * reached it: no run was in flight during either the capture pass or the remediation that rewrote
 * it. The rewrite swapped a hand-rolled span (`h-2 w-2` + Tailwind's opacity-only `animate-pulse`)
 * for the shared `StatusDot` (`h-1.5 w-1.5` + the 2s `status-pulse` that also scales), so the one
 * component in that remediation nothing had seen was also the one whose markup actually changed.
 * These render it directly at each liveness state instead, which holds better than a screenshot
 * would: a capture freezes one frame of a two-second loop, and what matters is which state gets
 * the animation at all.
 */

// runRowUtils thresholds: live at or under 45s, stalled from 120s, idle between them.
const NOW = 1_000_000;
const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

function runFixture(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		activityState: null,
		completedAt: null,
		durationMs: null,
		errorMessage: null,
		heartbeatAt: NOW - 10_000,
		id: 'run-1',
		projectName: 'Project One',
		projectPath: 'd:/applications/project-one',
		startedAt: NOW - 60_000,
		status: 'running',
		...overrides,
	};
}

function renderIndicator(overrides: Record<string, unknown> = {}): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { RunLivenessIndicator } from './src/pages/runs/RunLivenessIndicator.tsx';",
		`const run = ${JSON.stringify(runFixture(overrides))};`,
		`const el = createElement(RunLivenessIndicator, { now: ${NOW}, run });`,
		'console.log(renderToStaticMarkup(el));',
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

describe('Run liveness indicator', () => {
	test('every active-run listing renders the shared indicator', async () => {
		const surfacePaths = [
			['pages', 'runs', 'ActiveRunRow.tsx'],
			['pages', 'runs', 'ActiveRunMobileCard.tsx'],
			['pages', 'dashboard', 'ActiveRunsCard.tsx'],
			['pages', 'projects', 'detail', 'ActiveRunsPanel.tsx'],
			['pages', 'projects', 'detail', 'ActiveRunsBanner.tsx'],
		];

		for (const surfacePath of surfacePaths) {
			const source = await readFile(join(FRONTEND_SRC, ...surfacePath), 'utf8');
			expect(source).toContain('RunLivenessIndicator');
			expect(source).toContain('<RunLivenessIndicator now={now} run={run} />');
		}
	});

	test('a live run is the only state that animates its dot', () => {
		const live = renderIndicator({ heartbeatAt: NOW - 10_000 });

		expect(live).toContain('bg-emerald-500');
		expect(live).toContain('status-pulse');
		expect(live).toContain('Live');
	});

	test('a run past the heartbeat window goes amber and stops ticking', () => {
		// 60s: over the 45s live ceiling, under the 120s stall floor.
		const idle = renderIndicator({ heartbeatAt: NOW - 60_000 });

		expect(idle).toContain('bg-amber-500');
		expect(idle).not.toContain('status-pulse');
		expect(idle).toContain('No heartbeat 1m 0s');
	});

	test('a run past the reap threshold goes red and stops ticking', () => {
		const stalled = renderIndicator({ heartbeatAt: NOW - 300_000 });

		expect(stalled).toContain('bg-red-500');
		expect(stalled).not.toContain('status-pulse');
		expect(stalled).toContain('Stalled 5m 0s');
	});

	test('a run that has not reported yet reads as starting, not as stalled', () => {
		const unknown = renderIndicator({ heartbeatAt: null });

		expect(unknown).toContain('bg-muted-foreground');
		expect(unknown).not.toContain('status-pulse');
		expect(unknown).toContain('Starting');
		expect(unknown).toContain('title="No heartbeat received yet"');
	});

	test('the dot is the shared StatusDot, not the geometry it replaced', () => {
		const live = renderIndicator();

		expect(live).toContain('h-1.5 w-1.5');
		expect(live).not.toContain('h-2 w-2');
		// Tailwind's `animate-pulse` only fades. `status-pulse` fades and scales, and it is the
		// one every other dot in the app uses, which is the point of routing through StatusDot.
		expect(live).not.toContain('animate-pulse');
	});

	test('the agent activity reads as a phrase beside the liveness label', () => {
		const working = renderIndicator({ activityState: 'agent:tool_call' });

		expect(working).toContain('tool call');
		expect(working).not.toContain('agent:tool_call');
	});

	test('a terminal run renders nothing at all', () => {
		expect(renderIndicator({ status: 'completed' })).toBe('');
		expect(renderIndicator({ status: 'failed' })).toBe('');
	});
});
