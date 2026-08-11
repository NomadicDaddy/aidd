import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

interface AxisTick {
	label: string;
	offsetPct: number;
}

interface RenderedAxes {
	dense: string;
	diverging: AxisTick[];
	invocations: string;
	lines: string;
	rawExtrema: AxisTick[];
	singleSided: AxisTick[];
	strides: number[];
}

/**
 * Renders both telemetry charts through react-dom/server and reports the tick tables alongside the
 * markup. The charts are hand-drawn CSS bars, so the axis contract only exists as rendered output —
 * there is no chart config to assert against.
 */
function renderAxes(): RenderedAxes {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { OutputTimeseriesChart } from './src/pages/telemetry/OutputTimeseriesChart.tsx';",
		"import { TimeseriesChart } from './src/pages/telemetry/TelemetryComponents.tsx';",
		"import { categoryLabelStride, divergingTicks, singleSidedTicks } from './src/pages/telemetry/chartAxisScale.ts';",
		'const hour = 3600000;',
		'const start = 1772409600000;',
		'const invocationPoints = [0, 1, 2].map((index) => ({',
		'bucket: start + index * hour, completed: 10 + index, failed: 1, flagged: 1, killed: 1,',
		'noWork: 1, running: 1, stopped: 1, total: 16 + index, warnings: 1,',
		'}));',
		'const outputPoints = [0, 1, 2].map((index) => ({',
		'bucket: start + index * hour, cachedTokens: 100, filesChanged: 10, inputTokens: 500,',
		'linesAdded: 400 + index, linesRemoved: 200, outputTokens: 300, reasoningTokens: 50,',
		'runs: 4, runsWithFileData: 3, runsWithLineData: 3, runsWithTokenData: 3,',
		'}));',
		// A full 24h window at hourly resolution is the densest axis the telemetry page can ask for.
		'const densePoints = Array.from({ length: 24 }, (unused, index) => ({',
		'bucket: start + index * hour, completed: 2, failed: 0, flagged: 0, killed: 0,',
		'noWork: 0, running: 0, stopped: 0, total: 2, warnings: 0,',
		'}));',
		'console.log(JSON.stringify({',
		'dense: renderToStaticMarkup(createElement(TimeseriesChart, { bucket: "hour", points: densePoints })),',
		'diverging: divergingTicks(4000, 1000),',
		'invocations: renderToStaticMarkup(createElement(TimeseriesChart, { bucket: "hour", points: invocationPoints })),',
		'lines: renderToStaticMarkup(createElement(OutputTimeseriesChart, { bucket: "hour", metric: "lines", points: outputPoints })),',
		'rawExtrema: singleSidedTicks(41, { integral: true }),',
		'singleSided: singleSidedTicks(4000),',
		'strides: [3, 6, 7, 24, 30].map(categoryLabelStride),',
		'}));',
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
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedAxes;
}

/**
 * The category row holds only spans, so it can be sliced out without a parser.
 *
 * Two spans per column now, not one: the labels moved out of the flow so a date wider than its 20px
 * column can spill over the neighbours the stride leaves empty instead of being clipped by them. The
 * cell span is still one per bar, and a column the stride skips renders an empty one.
 */
function categoryLabels(markup: string): string[] {
	const row = /<div class="mt-1\.5 flex h-3 gap-1">(.*?)<\/div>/.exec(markup);
	if (!row) throw new Error('no category axis rendered');
	return (row[1] ?? '')
		.split('<span class="relative min-w-0 flex-1">')
		.slice(1)
		.map((cell) => /<span class="absolute[^"]*">([^<]*)<\/span>/.exec(cell)?.[1] ?? '');
}

/**
 * Every gridline's offset, in document order.
 *
 * The class is matched loosely on purpose. Gridlines carry one of two weights — the zero line is
 * drawn at twice the strength of the rest, because it is the baseline on one chart and the hinge on
 * the other — and pinning the exact token would make this helper silently stop seeing one of them.
 * `gridlineWeights` below is what guards the weights; this one guards the offsets.
 */
function gridlineOffsets(markup: string): string[] {
	return [
		...markup.matchAll(/<span class="absolute inset-x-0 border-t [^"]*" style="top:(.*?)"/g),
	].map((match) => match[1] ?? '');
}

/** The gridline colour token at each offset, so the zero line's extra weight is asserted. */
function gridlineWeights(markup: string): string[] {
	return [
		...markup.matchAll(/<span class="absolute inset-x-0 border-t (border-[^"]*)" style="top:/g),
	].map((match) => match[1] ?? '');
}

describe('Telemetry chart axes', () => {
	const rendered = renderAxes();

	test('both charts render a category axis labelled with their buckets', () => {
		// `renderCharts` in telemetry-chart-accessibility covers the bucket→label formatter; this
		// only asserts one label per column, in bar order, reaching the axis.
		expect(categoryLabels(rendered.invocations)).toHaveLength(3);
		expect(categoryLabels(rendered.lines)).toHaveLength(3);
		for (const label of categoryLabels(rendered.invocations)) {
			expect(label).toMatch(/\d/);
		}
		expect(categoryLabels(rendered.invocations)).toEqual(categoryLabels(rendered.lines));
	});

	test('the value scale carries a max, a midpoint and a baseline on their gridlines', () => {
		expect(rendered.singleSided).toEqual([
			{ label: '4K', offsetPct: 0 },
			{ label: '2K', offsetPct: 50 },
			{ label: '0', offsetPct: 100 },
		]);
		// The diverging chart puts zero at its center, but each arm carries its own domain: a shared
		// max anchored on the larger arm flattened the smaller one to its 2px minimum, so the two
		// halves are labelled independently and the reader takes magnitude from the axis.
		expect(rendered.diverging).toEqual([
			{ label: '4K', offsetPct: 0 },
			{ label: '2K', offsetPct: 25 },
			{ label: '0', offsetPct: 50 },
			{ label: '500', offsetPct: 75 },
			{ label: '1K', offsetPct: 100 },
		]);
		expect(gridlineOffsets(rendered.invocations)).toEqual(['0%', '50%', '100%']);
		expect(gridlineOffsets(rendered.lines)).toEqual(['0%', '25%', '50%', '75%', '100%']);
	});

	test('gridlines carry a visible weight, and the zero line carries twice it', () => {
		// `border-border` is a card-edge weight, and these rules are not edges: on the card surface
		// it measured 1.23:1 in dark and 1.26:1 in light, so the thing tying a bar's height to its
		// tick was invisible. The zero line is separated again from the rest because it is the
		// baseline on the invocations chart and the axis both arms hinge on in the diverging one.
		expect(gridlineWeights(rendered.invocations)).toEqual([
			'border-muted-foreground/20',
			'border-muted-foreground/20',
			'border-muted-foreground/40',
		]);
		expect(gridlineWeights(rendered.lines)).toEqual([
			'border-muted-foreground/20',
			'border-muted-foreground/20',
			'border-muted-foreground/40',
			'border-muted-foreground/20',
			'border-muted-foreground/20',
		]);
		expect(gridlineWeights(rendered.invocations)).not.toContain('border-border');
	});

	test('the diverging chart draws its center baseline as a gridline, not a bespoke rule', async () => {
		const output = await Bun.file(
			resolve(
				import.meta.dir,
				'../../frontend/src/pages/telemetry/OutputTimeseriesChart.tsx',
			),
		).text();

		expect(output).toContain('divergingTicks(maxUp, maxDown)');
		expect(output).not.toContain('top-1/2 h-px bg-muted');
	});

	test('a count axis is rounded to a whole-number domain, not to the raw data max', () => {
		// The invocations axis used to label the raw max and half of it, which is how a chart of
		// whole invocations came to carry a `20.5` tick. Rounding the domain — not just the label —
		// keeps the bar heights honest about what the axis claims.
		expect(rendered.rawExtrema).toEqual([
			{ label: '50', offsetPct: 0 },
			{ label: '25', offsetPct: 50 },
			{ label: '0', offsetPct: 100 },
		]);
		for (const tick of rendered.rawExtrema) {
			expect(tick.label).not.toContain('.');
		}
	});

	test('axis labels use the meta type scale and semantic tokens', () => {
		for (const markup of [rendered.invocations, rendered.lines]) {
			expect(markup).toContain(
				'class="absolute right-0 -translate-y-1/2 text-xs leading-none text-muted-foreground tabular-nums"',
			);
			expect(markup).toContain(
				'class="absolute top-0 text-xs leading-none whitespace-nowrap text-muted-foreground',
			);
		}
		// Hard-coded greys would drop out of the theme; the gridlines and both label rows stay on
		// border/muted-foreground.
		expect(rendered.invocations).not.toMatch(/text-(?:gray|neutral|slate|zinc)-\d/);
	});

	test('a dense window thins its labels instead of overprinting them', () => {
		// 6 fits as-is; denser windows step up so the drawn count never exceeds 6.
		expect(rendered.strides).toEqual([1, 1, 2, 4, 5]);

		const labels = categoryLabels(rendered.dense);
		expect(labels).toHaveLength(24);
		const drawn = labels.filter((label) => label !== '');
		expect(drawn.length).toBeGreaterThan(2);
		expect(drawn.length).toBeLessThanOrEqual(6);
		// Anchored to the newest bucket: the right-hand end is what the window is centered on, so
		// it keeps its label at every density.
		expect(labels[labels.length - 1]).not.toBe('');
		// Every bucket still reaches assistive tech through the sr-only table, thinned or not.
		expect(rendered.dense.match(/<th scope="row">/g)).toHaveLength(24);
	});
});
