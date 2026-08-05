import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { formatActiveDuration } from '../../frontend/src/lib/formatters.ts';

const FRONTEND_SRC = join(import.meta.dir, '..', '..', 'frontend', 'src');

async function readSource(...segments: string[]): Promise<string> {
	return readFile(join(FRONTEND_SRC, ...segments), 'utf8');
}

// A running pipeline step has `startedAt` set but `durationMs` still null (the
// backend only writes durationMs when the step completes), so rendering it with
// formatDuration pins the label at "0s" for the whole step. Both step-row
// surfaces must derive live elapsed time from startedAt instead.
describe('pipeline step duration stays live while a step runs', () => {
	test('a running step reports elapsed time, not 0s', () => {
		const startedAt = 1_700_000_000_000;
		expect(formatActiveDuration(null, startedAt, startedAt + 95_000)).toBe('1m 35s');
	});

	test('a queued step with no startedAt still reads 0s', () => {
		expect(formatActiveDuration(null, null, 1_700_000_000_000)).toBe('0s');
	});

	test('a completed step keeps its persisted duration', () => {
		expect(formatActiveDuration(42_000, 1_700_000_000_000, 1_700_000_999_999)).toBe('42s');
	});

	test('runs-page step sub-rows format duration against a ticking now', async () => {
		const source = await readSource('pages', 'runs', 'PipelineStepSubRows.tsx');
		expect(source).toContain('formatActiveDuration(step.durationMs, step.startedAt, now)');
		expect(source).not.toContain('formatDuration(step.durationMs)');
	});

	test('report-page executed step rows format duration against a ticking now', async () => {
		const source = await readSource('pages', 'pipelineSessions', 'StepRows.tsx');
		expect(source).toContain('formatActiveDuration(step.durationMs, step.startedAt, now)');
		expect(source).not.toContain('formatDuration(step.durationMs)');
	});

	test('both step-row surfaces receive now from a useNow clock', async () => {
		const table = await readSource('pages', 'runs', 'UnifiedExecutionTable.tsx');
		const report = await readSource(
			'pages',
			'pipelineSessions',
			'PipelineSessionReportPage.tsx',
		);
		expect(table).toContain('useNow');
		// One `stepSubRows` helper wired to the ticking clock, rendered at both the table and the
		// mobile-list surface — so the two can no longer drift apart the way two literal copies of
		// the element could.
		expect(table).toMatch(
			/const stepSubRows = [\s\S]*?<PipelineStepSubRows[\s\S]*?now=\{now\}/,
		);
		expect(table.match(/stepSubRows\(entry\)/g)).toHaveLength(2);
		expect(report).toContain('useNow');
		expect(report).toContain('<StepsCard now={now}');
	});
});
