import { orchestratorExitCodes } from 'aidd-shared/orchestrator/exit-codes';
import { classifyWebRun, classifyWebRunTelemetryBucket } from 'aidd-shared/runs/outcome';
import { describe, expect, test } from 'bun:test';

/**
 * `remediation-20260805-polish-telemetry`, spec items 1-6.
 *
 * Each test states the finding it closes, so a later change that reopens one fails against the
 * reason rather than against a class string nobody can place.
 */
const telemetry = async (file: string): Promise<string> =>
	await Bun.file(`${import.meta.dir}/../../frontend/src/pages/telemetry/${file}`).text();

describe('telemetry polish', () => {
	test('scales each arm of the diverging chart against its own domain', async () => {
		const chart = await telemetry('OutputTimeseriesChart.tsx');
		const scale = await telemetry('chartAxisScale.ts');

		// One symmetric scale anchored on the larger arm emptied the whole lower half of the
		// token chart: against 352.9M in and 1.5M out every downward bar collapsed to its 2px
		// minimum. Each arm carries its own domain, and the axis labels both.
		expect(chart).toContain('const maxUp = niceAxisMax(');
		expect(chart).toContain('const maxDown = niceAxisMax(');
		expect(chart).toContain('(down / maxDown)');
		expect(scale).toContain('export function divergingTicks(\n\tup: number,\n\tdown: number,');
		expect(scale).toContain('const upDomain = niceAxisMax(up, options);');
		expect(scale).toContain('const downDomain = niceAxisMax(down, options);');
	});

	test('lets a category label overflow its column instead of being clipped', async () => {
		const axes = await telemetry('ChartAxes.tsx');

		// 21 daily buckets give each column 20px to hold a 27-35px date. In the flow the cell
		// clipped it — 'Aug 1' rendered as 'Aug'. Out of the flow it spills over the neighbours
		// the stride leaves empty.
		expect(axes).toContain('absolute top-0 text-xs leading-none whitespace-nowrap');
		expect(axes).toContain("'left-1/2 -translate-x-1/2'");
		// Nothing clips the label row any more, and the row keeps a height of its own now that
		// its children contribute none.
		expect(axes).not.toContain('flex gap-1 overflow-hidden');
		expect(axes).toContain('mt-1.5 flex h-3 gap-1');
	});

	test('skips the breakdown bar when it can only ever be full', async () => {
		const components = await telemetry('TelemetryComponents.tsx');
		const guards = components.match(/const ranks = max !== Math\.min\(/gu);

		// The same guard LeaderboardCard makes: a single-row backend breakdown drew a full-width
		// accent bar across the card that could only ever read 100%.
		expect(guards).toHaveLength(2);
		expect(components.match(/\{ranks \? \(/gu)).toHaveLength(2);
	});

	test('lets the Details cell inherit the row alignment', async () => {
		const table = await telemetry('InvocationsTable.tsx');

		// All 38 'Inspect' links floated about 16px above the rows they belong to. Matched on the
		// class list, not the file: the comment above the cell still names what it dropped.
		expect(table).not.toMatch(/className="[^"]*align-top/u);
	});

	test('names the tile a row is counted under rather than its raw status', async () => {
		const table = await telemetry('InvocationsTable.tsx');

		expect(table).toContain('const tally = bucketLabels[classifyWebRunTelemetryBucket(run)];');
		expect(table).toContain('Counted under {tally}');
		// The raw lifecycle status is what disagreed with the tally, and nothing prints it now.
		expect(table).not.toContain('{invocation.status}\n');
	});

	test('the sub-line cannot contradict the tile an aborted run feeds', () => {
		// The finding, as data: an aborted run carries status 'failed' and a neutral badge, and
		// is tallied under Stopped — so the old sub-line put the word "failed" beneath a neutral
		// badge, under a red FAILED tile that does not count it.
		const aborted = {
			exitCode: orchestratorExitCodes.aborted,
			status: 'failed',
			stopReason: 'exit_error',
			summary: null,
		} as const;

		expect(classifyWebRun(aborted).label).toBe('Aborted');
		expect(classifyWebRun(aborted).tone).toBe('neutral');
		expect(classifyWebRunTelemetryBucket(aborted)).not.toBe('failed');
	});

	test('gives no dot to a quantity no legend explains', async () => {
		const summary = await telemetry('TelemetrySummary.tsx');

		// Total invocations, Top-level actions and Nested steps are not a series in any chart on
		// the page, so their cyan, indigo and magenta stood for nothing a reader could look up.
		expect(summary).toContain('<Metric label="Total invocations" value={totals.total} />');
		expect(summary).toContain('<Metric label="Top-level actions" value={totals.topLevel} />');
		expect(summary).toContain('<Metric label="Nested steps" value={totals.nested} />');
		expect(summary).not.toContain('seriesSolid');
		// The outcome tiles keep theirs — those colours are the chart's, and its legend names them.
		expect(summary.match(/marker=\{outcomeDot\(outcomeSolid\./gu)).toHaveLength(8);
	});
});
