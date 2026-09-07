import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { formatRunNarrative } from '../../frontend/src/pages/pipelineSessions/runNarrative.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend/src');

function source(relativePath: string): Promise<string> {
	return Bun.file(resolve(frontendRoot, relativePath)).text();
}

describe('activity and report hierarchy', () => {
	test('keeps Runs History dividers on the semantic border token', async () => {
		const table = await source('pages/runs/UnifiedExecutionTable.tsx');

		expect(table).toContain('<tbody className="[&>tr]:border-border">');
		expect(table).toContain('divide-y divide-border');
	});

	test('aligns the Diary action and record feed to the data rail', async () => {
		const diary = await source('pages/diary/DiaryPage.tsx');

		expect(diary).toContain('const PAGE_RAIL = pageRailByContentType.data;');
		expect(diary).toContain('<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>');
		expect(diary.indexOf('rail={PAGE_RAIL}')).toBeLessThan(diary.indexOf('title="Diary"'));
	});

	test('reads the pipeline report on its declared rail and integrates status into its responsive fact grid', async () => {
		const page = await source('pages/pipelineSessions/PipelineSessionReportPage.tsx');
		const summary = await source('pages/pipelineSessions/SessionSummaryCard.tsx');

		expect(page).toContain('const PAGE_RAIL = pageRailByContentType.reading;');
		expect(page).toContain('<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>');
		// 56rem, not 61rem: the strip's container is the rail itself, and the rail is 61rem, so
		// the old step fired only at exact equality with its own maximum.
		expect(summary).toContain('@min-[56rem]:grid-cols-5');
		expect(summary).toContain('@min-[56rem]:grid-cols-4');
		expect(summary).toContain('@min-[45rem]:grid-cols-3');
		expect(summary).toContain(
			'const gridMetricCount = hasFullStatus ? metricCount - 1 : metricCount;',
		);
		expect(summary.indexOf('label="Status"')).toBeLessThan(summary.indexOf('label="Started"'));
		expect(
			summary.slice(summary.indexOf('label="Status"'), summary.indexOf('label="Started"')),
		).toContain('size="compact"');
	});

	test('marks an incomplete persisted run narrative without altering complete prose', () => {
		const clipped = 'The run finish'.padStart(400, 'x');

		expect(formatRunNarrative(clipped)).toBe(`${clipped}…`);
		expect(formatRunNarrative('validate found no feature contract issues')).toBe(
			'validate found no feature contract issues',
		);
		expect(formatRunNarrative('The run finished successfully.')).toBe(
			'The run finished successfully.',
		);
		expect(formatRunNarrative(`${'x'.repeat(398)}.”`)).toBe(`${'x'.repeat(398)}.”`);
	});

	test('keeps the UI truncation signal aligned with the run summary producer', async () => {
		const producer = await Bun.file(
			resolve(frontendRoot, '../../cli/src/orchestrator/run/ai-summary.ts'),
		).text();
		const presenter = await source('pages/pipelineSessions/runNarrative.ts');

		expect(producer).toContain('MAX_AI_SUMMARY_LENGTH = 400');
		expect(presenter).toContain('runAiSummaryMaxLength = 400');
	});
});
