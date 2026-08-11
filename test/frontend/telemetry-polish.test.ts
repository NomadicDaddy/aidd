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
		// One guard in each of the two components that draw a proportional bar. They live in
		// separate modules now, so the pair is counted across both rather than within one file.
		const sources = await Promise.all(
			['LeaderboardCard.tsx', 'TelemetryComponents.tsx'].map(telemetry),
		);
		const joined = sources.join('\n');
		const guards = joined.match(/const ranks = max !== Math\.min\(/gu);

		// The same guard LeaderboardCard makes: a single-row backend breakdown drew a full-width
		// accent bar across the card that could only ever read 100%.
		expect(guards).toHaveLength(2);
		expect(joined.match(/\{ranks \? \(/gu)).toHaveLength(2);
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
		// Asserted as "these three carry no marker" rather than by pinning their exact markup —
		// they have since gained a `detail` and an `icon`, neither of which is a colour claim.
		//
		// Sliced on the element boundary rather than matched with `[^>]*`: the icon prop holds a
		// self-closing element of its own, so a `>`-terminated pattern stops inside the tile it is
		// trying to read and the assertion silently passes on `undefined`.
		const tiles = summary.split('<Metric').slice(1);
		for (const label of ['Total invocations', 'Top-level actions', 'Nested steps']) {
			const tile = tiles.find((chunk) => chunk.includes(`label="${label}"`));
			expect(`${label}: ${tile !== undefined}`).toBe(`${label}: true`);
			expect(`${label}: ${tile?.includes('marker=')}`).toBe(`${label}: false`);
		}
		expect(summary).not.toContain('seriesSolid');
		// The outcome tiles keep theirs — those colours are the chart's, and its legend names them.
		expect(summary.match(/marker=\{outcomeDot\(outcomeSolid\./gu)).toHaveLength(8);
	});

	test('says what span the headline figures cover and how the split divides', async () => {
		const summary = await telemetry('TelemetrySummary.tsx');
		const page = await telemetry('TelemetryPage.tsx');

		// '38' beside 'Total invocations' was 38 of a span named only by a control two cards up,
		// and Top-level/Nested sum to the total, which is one figure rather than a subtraction the
		// reader performs.
		expect(summary).toContain("'in the last 24 hours'");
		expect(summary).toContain('percent(totals.topLevel, totals.total)');
		expect(summary).toContain('percent(totals.nested, totals.total)');
		expect(page).toContain('windowLabel=');
	});
});
