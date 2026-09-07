import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { dashboardCardPlacements } from '../../frontend/src/pages/dashboard/dashboard-shared.ts';
import {
	telemetryTypeParam,
	telemetryWindowLabel,
	telemetryWindowMs,
} from '../../frontend/src/pages/telemetry/telemetryFilters.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend/src');

function source(relativePath: string): Promise<string> {
	return Bun.file(resolve(frontendRoot, relativePath)).text();
}

describe('dashboard local design findings', () => {
	test('gives fleet tables usable width, height, and count context', async () => {
		const [
			page,
			metrics,
			statusCard,
			summaryCard,
			statusRows,
			summaryRows,
			projectHealth,
			queue,
		] = await Promise.all([
			source('pages/dashboard/DashboardPage.tsx'),
			source('pages/dashboard/DashboardMetrics.tsx'),
			source('pages/dashboard/FeatureStatusCard.tsx'),
			source('pages/dashboard/FeatureSummaryCard.tsx'),
			source('pages/dashboard/FeatureStatusRows.tsx'),
			source('pages/dashboard/FeatureSummaryRows.tsx'),
			source('pages/dashboard/ProjectHealthCard.tsx'),
			source('pages/dashboard/FeatureQueueCard.tsx'),
		]);

		expect(page).toContain("id: 'feature-summary',");
		expect(page).toContain('fullWidth: true,');
		for (const card of [statusCard, summaryCard]) {
			expect(card).toContain('className="overflow-hidden"');
			expect(card).not.toContain('tableMeasureClass');
		}
		for (const rows of [statusRows, summaryRows]) {
			expect(rows).toContain('tableMeasureClass');
			expect(rows).toContain('tableHeadClass');
			expect(rows).toContain('<SortableColumnHeader');
		}
		for (const rows of [statusRows, summaryRows, projectHealth]) {
			expect(rows).not.toContain('max-h-[max(28rem,calc(100dvh-22rem))]');
		}
		for (const boundedPreview of [statusCard, summaryRows, projectHealth]) {
			expect(boundedPreview).toContain('DASHBOARD_CARD_MAX_ROWS');
		}
		expect(statusCard).toContain('<FieldRow group label="State">');
		expect(statusCard).toContain('<FieldRow group label="Category">');
		for (const readout of [statusCard, summaryRows, projectHealth]) {
			expect(readout).toContain('<FilterToolbarReadout');
			expect(readout).toContain('responsiveScope="viewport"');
		}
		expect(statusCard).toContain('readoutSuffix={<> · {totalRows} total</>}');
		expect(metrics.match(/<Link/gu)).toHaveLength(4);
		expect(metrics).toContain('projectsReading.split.failing > 0 ? toneText.red : undefined');
		expect(metrics).toMatch(/label="Projects"[\s\S]*loading=\{projectsLoading\}/);
		expect(metrics).toMatch(/label="Priority Health"[\s\S]*loading=\{priorityHealthLoading\}/);
		expect(queue).toContain('{visibleQueue.length} of {total} queued');
	});

	test('removes repeated figures and keeps priority treatment consistent', async () => {
		const [summary, queue, health] = await Promise.all([
			source('pages/dashboard/FeatureSummaryCard.tsx'),
			source('pages/dashboard/FeatureQueueCard.tsx'),
			source('pages/dashboard/ProjectHealthRow.tsx'),
		]);

		expect(summary).not.toContain('<Metric');
		expect(queue).toContain('<Badge tone={priorityTone(item.priority)}>');
		expect(health).toContain('project.milestoneCount === 1 ? null');
	});

	test('keeps one reading order, suggestion treatment, and local content measure', async () => {
		const [metrics, waiting, director, summary, health, queue, active] = await Promise.all([
			source('pages/dashboard/DashboardMetrics.tsx'),
			source('pages/dashboard/WaitingApprovalRows.tsx'),
			source('pages/dashboard/DirectorQueueCard.tsx'),
			source('pages/dashboard/SuggestionSummary.tsx'),
			source('pages/dashboard/ProjectHealthCard.tsx'),
			source('pages/dashboard/FeatureQueueCard.tsx'),
			source('pages/dashboard/ActiveRunsCard.tsx'),
		]);

		// Reading order is a property of the rendered tree, not of declaration order: the
		// projects tile is held in a variable above the tree because its failed state carries a
		// Retry button, which cannot sit inside the Link every other tile is wrapped in.
		const tree = metrics.slice(metrics.indexOf('<section aria-label="Fleet metrics"'));
		expect(tree.indexOf('label="Suggestions"')).toBeLessThan(
			tree.indexOf('label="Priority Health"'),
		);
		expect(tree.indexOf('label="Priority Health"')).toBeLessThan(
			tree.indexOf('label="Active Runs"'),
		);
		expect(tree.indexOf('label="Active Runs"')).toBeLessThan(tree.indexOf('{projectsTile}'));
		for (const consumer of [waiting, director])
			expect(consumer).toContain('<SuggestionSummary');
		expect(summary).toContain('<h3 className="line-clamp-2 text-sm font-semibold');
		expect(summary).toContain("expanded ? '' : 'line-clamp-2'");
		expect(summary).toContain('aria-expanded={expanded}');
		for (const measuredList of [health, queue]) {
			expect(measuredList).toContain('tableMeasureClass');
		}
		expect(active).toContain('activeRuns.length > 0 ? toneText.amber : toneText.neutral');
	});

	test('packs the next dashboard card into the shorter measured column', () => {
		expect(dashboardCardPlacements([false, false, false, false], [700, 100, 120, 80])).toEqual([
			{ column: 1, rowSpan: 700, rowStart: 1 },
			{ column: 2, rowSpan: 100, rowStart: 1 },
			{ column: 2, rowSpan: 120, rowStart: 117 },
			{ column: 2, rowSpan: 80, rowStart: 253 },
		]);
	});
});

describe('diary local design findings', () => {
	test('aligns card actions and timeline columns while preserving readable prose', async () => {
		const [entry, timeline, columns, detail] = await Promise.all([
			source('pages/diary/DiaryEntryCard.tsx'),
			source('pages/diary/DiaryTimelineList.tsx'),
			source('pages/diary/diaryTimelineColumns.ts'),
			source('pages/diary/DiaryTimelineDetail.tsx'),
		]);

		expect(entry).toContain('<div className="flex flex-wrap items-center gap-2">');
		expect(entry).toContain('variant="embedded"');
		expect(entry).not.toContain('font-mono');
		expect(timeline).toContain('@min-[45rem]:grid-cols-(--diary-grid-columns)');
		expect(timeline).toContain('diaryTimelineColumns(kindFilter, showProject)');
		expect(columns).toContain("kind: kindFilter === 'all'");
		expect(columns).toContain("status: kindFilter !== 'release'");
		expect(timeline).not.toContain('font-mono text-xs text-muted-foreground');
		expect(timeline).toContain('<DiaryTimelineDetail detail={detail} itemId={item.id} />');
		expect(detail).toContain("!expanded && 'line-clamp-2'");
		expect(detail).toContain("? 'Collapse summary'");
		expect(detail).toContain("? 'Show available summary'");
		expect(detail).toContain(": 'Read full summary'");
		expect(detail).toContain('clamped || sourceTruncated || expanded');
		expect(detail).toContain('detail.length === AI_SUMMARY_MAX_CHARS');
		// The row is the container and the two-line clamp is the cap. This was four `max-w-none`
		// overrides cancelling a measure the renderer applied to everyone; the rendered width is
		// unchanged and the override is gone.
		expect(detail).toContain('measure="prose"');
		expect(detail).not.toContain('[&>p]:max-w-none');
		expect(detail).toContain('className="relative z-10 mt-1 items-end gap-2 @min-[45rem]:grid');
		expect(detail).toContain('className="@container"');
	});
});

describe('telemetry local design findings', () => {
	test('uses the shared labelled filter toolbar and translates its query values', async () => {
		const toolbar = await source('pages/telemetry/TelemetryFilterToolbar.tsx');

		expect(toolbar).toContain('<FilterToolbar');
		expect(toolbar).toContain('<FieldRow group label="Resource type">');
		expect(toolbar).toContain('<FieldRow group label="Time window">');
		expect(telemetryTypeParam('all')).toBeUndefined();
		expect(telemetryTypeParam('recipe')).toBe('recipe');
		expect(telemetryWindowMs('24h')).toBe(86_400_000);
		expect(telemetryWindowLabel('7d')).toBe('7d');
	});

	test('connects outcome tiles to a filtered recent-invocations surface', async () => {
		const [page, summary] = await Promise.all([
			source('pages/telemetry/TelemetryPage.tsx'),
			source('pages/telemetry/TelemetrySummary.tsx'),
		]);

		expect(summary).toContain('aria-pressed={active}');
		expect(summary).toContain('surface="panel"');
		expect(page).toContain('invocationOutcomeBucket(invocation) === outcomeFilter');
		expect(page).toContain('id="recent-invocations"');
		expect(page).toContain('availableResources={availableResources}');
		expect(page).toContain('invocations={visibleInvocations}');
	});

	test('keeps table context and exact chart values available in long views', async () => {
		const [table, invocationChart, outputChart, details] = await Promise.all([
			source('pages/telemetry/InvocationsTable.tsx'),
			source('pages/telemetry/TelemetryComponents.tsx'),
			source('pages/telemetry/OutputTimeseriesChart.tsx'),
			source('pages/telemetry/InvocationDetails.tsx'),
		]);

		expect(table).toContain('sticky top-0 z-10 bg-muted');
		expect(table).toContain('max-h-[calc(100dvh-16rem)]');
		expect(table).toContain('<Tooltip content={outcome.title}>');
		expect(invocationChart).toContain('@min-[45rem]:h-64');
		expect(outputChart).toContain('@min-[45rem]:h-48');
		expect(details).toContain('@min-[61rem]:grid-cols-4');
	});

	test('keys accessible chart rows by raw bucket identity, not formatted labels', async () => {
		const [table, invocationChart, outputChart] = await Promise.all([
			source('pages/telemetry/TelemetryChartTable.tsx'),
			source('pages/telemetry/TelemetryComponents.tsx'),
			source('pages/telemetry/OutputTimeseriesChart.tsx'),
		]);

		expect(table).toContain('bucket: number;');
		expect(table).toContain('label: string;');
		expect(table).toContain('<tr key={row.bucket}>');
		expect(table).toContain('<th scope="row">{row.label}</th>');
		for (const chart of [invocationChart, outputChart]) {
			expect(chart).toContain('bucket: point.bucket,');
			expect(chart).toContain('label: formatTelemetryBucketLabel(bucket, point.bucket),');
		}
	});
});
