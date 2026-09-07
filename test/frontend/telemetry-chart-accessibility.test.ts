import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

interface RenderedCharts {
	invocations: string;
	labels: string[];
	lines: string;
	tokens: string;
}

function renderCharts(): RenderedCharts {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { OutputTimeseriesChart } from './src/pages/telemetry/OutputTimeseriesChart.tsx';",
		"import { TimeseriesChart } from './src/pages/telemetry/TelemetryComponents.tsx';",
		"import { formatTelemetryBucketLabel } from './src/lib/formatters.ts';",
		'const timestamps = [1772409600000, 1772413200000];',
		'const invocationPoints = [',
		'{ bucket: timestamps[0], completed: 11, failed: 5, flagged: 1, killed: 3, noWork: 7, running: 4, stopped: 2, total: 37, warnings: 4 },',
		'{ bucket: timestamps[1], completed: 13, failed: 6, flagged: 2, killed: 2, noWork: 8, running: 5, stopped: 3, total: 44, warnings: 5 },',
		'];',
		'const outputPoints = [',
		'{ bucket: timestamps[0], cachedTokens: 101, filesChanged: 11, inputTokens: 501, linesAdded: 401, linesRemoved: 201, outputTokens: 301, reasoningTokens: 51, runs: 4, runsWithFileData: 3, runsWithLineData: 3, runsWithTokenData: 3 },',
		'{ bucket: timestamps[1], cachedTokens: 102, filesChanged: 12, inputTokens: 502, linesAdded: 402, linesRemoved: 202, outputTokens: 302, reasoningTokens: 52, runs: 5, runsWithFileData: 4, runsWithLineData: 4, runsWithTokenData: 4 },',
		'];',
		'console.log(JSON.stringify({',
		'invocations: renderToStaticMarkup(createElement(TimeseriesChart, { bucket: "hour", points: invocationPoints })),',
		'labels: timestamps.map((timestamp) => formatTelemetryBucketLabel("hour", timestamp)),',
		'lines: renderToStaticMarkup(createElement(OutputTimeseriesChart, { bucket: "hour", metric: "lines", points: outputPoints })),',
		'tokens: renderToStaticMarkup(createElement(OutputTimeseriesChart, { bucket: "hour", metric: "tokens", points: outputPoints })),',
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
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedCharts;
}

describe('Telemetry chart accessibility', () => {
	test('exposes every invocation bucket and outcome in a semantic table', () => {
		const { invocations, labels } = renderCharts();

		expect(invocations).toContain('aria-labelledby="telemetry-invocations-chart-heading"');
		expect(invocations).toContain('Invocations by time bucket');
		// Desktop bars stay focusable and name their exact values. Below `sm`, the same geometry is
		// non-interactive because a dense hourly plot cannot give every bucket a 44px width; the
		// semantic table preserves the complete linear representation at every viewport.
		expect(invocations).toContain('<div><div class="mt-2 grid grid-cols-[auto_minmax(0,1fr)]');
		expect(invocations).toContain('class="flex h-40 items-end gap-1 @min-[45rem]:h-64');
		expect(invocations).toContain(
			`aria-label="${labels[0]} · 37 invocations (11 completed, 4 warnings, 5 failed`,
		);
		expect(invocations.match(/<button/g)).toHaveLength(2);
		expect(
			invocations.match(/aria-hidden="true" class="flex h-full w-full flex-col/g),
		).toHaveLength(2);
		expect(invocations).toContain(
			'<caption>Invocation totals and outcomes for each time bucket</caption>',
		);
		expect(invocations).toContain(
			'<th scope="col">Total</th><th scope="col">Completed</th><th scope="col">Warnings</th>',
		);
		expect(invocations).toContain(
			`<th scope="row">${labels[0]}</th><td>37</td><td>11</td><td>4</td><td>5</td><td>1</td><td>2</td><td>3</td><td>7</td><td>4</td>`,
		);
		expect(invocations).toContain(
			`<th scope="row">${labels[1]}</th><td>44</td><td>13</td><td>5</td><td>6</td><td>2</td><td>3</td><td>2</td><td>8</td><td>5</td>`,
		);
	});

	test('renders Failed and Killed as separate series in both themes', () => {
		const { invocations } = renderCharts();

		// Both outcomes are non-zero in both buckets above, so this checks the aria-hidden phone bars,
		// desktop tooltip bars, and legend. A plain orange-600 sits only 0.009 lightness away from
		// red-500; the theme-specific orange step keeps the pair separated at rest and on hover.
		expect(invocations.match(/bg-red-500/g)).toHaveLength(5);
		expect(invocations.match(/bg-orange-400 dark:bg-orange-700/g)).toHaveLength(5);
		expect(
			invocations.match(/group-hover:bg-red-400 dark:group-hover:bg-red-400/g),
		).toHaveLength(4);
		expect(
			invocations.match(/group-hover:bg-orange-300 dark:group-hover:bg-orange-600/g),
		).toHaveLength(4);
		expect(invocations).not.toContain('bg-orange-600 group-hover:bg-orange-500');
	});

	test('renders a unique non-colour texture beside every legend label', () => {
		const { invocations } = renderCharts();
		const markerPattern =
			/<span aria-hidden="true" class="h-2 w-2 rounded-full ([^"]+)"><\/span>([^<]+)/gu;
		const markers = [...invocations.matchAll(markerPattern)].map((match) => ({
			classes: match[1],
			label: match[2],
		}));

		expect(markers).toHaveLength(8);
		expect(new Set(markers.map((marker) => marker.classes)).size).toBe(8);
		expect(
			markers.every((marker) => marker.classes?.includes('repeating-linear-gradient')),
		).toBe(true);
		expect(markers.map((marker) => marker.label)).toEqual([
			'Completed',
			'Warnings',
			'Failed',
			'Flagged',
			'Stopped',
			'Killed',
			'No work',
			'Running',
		]);
	});

	test('exposes every output bucket and metric in semantic tables', () => {
		const { labels, lines, tokens } = renderCharts();

		expect(lines).toContain('aria-labelledby="telemetry-output-lines-chart-heading"');
		expect(lines).toContain('Line changes by time bucket');
		// The bars are keyboard-readable from `sm` up while both arms share one signed domain around
		// zero; the phone rendering keeps only the non-interactive geometry and semantic table.
		expect(lines).toContain('<div class="mt-2 grid grid-cols-[auto_minmax(0,1fr)]');
		expect(lines).toContain('>500</span>');
		expect(lines).toContain('>−500</span>');
		expect(lines).not.toContain('this half scales to');
		// Shorter than the single-sided invocations chart above: the two arms split this height
		// between them, so `h-40` left a persistent empty band under the smaller arm.
		expect(lines).toContain('class="relative flex h-32 gap-1 @min-[45rem]:h-48');
		expect(lines).toContain(`aria-label="${labels[0]} · +401 / −201 lines · 11 files changed`);
		expect(lines.match(/<button/g)).toHaveLength(2);
		expect(lines.match(/aria-hidden="true" class="flex h-full w-full flex-col/g)).toHaveLength(
			2,
		);
		expect(lines).toContain('<caption>Line changes for each time bucket</caption>');
		expect(lines).toContain(
			`<th scope="row">${labels[0]}</th><td>401</td><td>201</td><td>11</td><td>3</td><td>4</td>`,
		);
		expect(lines).toContain(
			`<th scope="row">${labels[1]}</th><td>402</td><td>202</td><td>12</td><td>4</td><td>5</td>`,
		);

		expect(tokens).toContain('aria-labelledby="telemetry-output-tokens-chart-heading"');
		expect(tokens).toContain('Token usage by time bucket');
		expect(tokens).toContain('<caption>Token usage for each time bucket</caption>');
		expect(tokens).toContain(
			`<th scope="row">${labels[0]}</th><td>501</td><td>301</td><td>101</td><td>51</td><td>3</td><td>4</td>`,
		);
		expect(tokens).toContain(
			`<th scope="row">${labels[1]}</th><td>502</td><td>302</td><td>102</td><td>52</td><td>4</td><td>5</td>`,
		);
	});

	test('uses one shared Intl formatter instead of getHours labels', async () => {
		const [components, output, formatters] = await Promise.all([
			Bun.file(
				resolve(
					import.meta.dir,
					'../../frontend/src/pages/telemetry/TelemetryComponents.tsx',
				),
			).text(),
			Bun.file(
				resolve(
					import.meta.dir,
					'../../frontend/src/pages/telemetry/OutputTimeseriesChart.tsx',
				),
			).text(),
			Bun.file(resolve(import.meta.dir, '../../frontend/src/lib/formatters.ts')).text(),
		]);

		expect(components).toContain('formatTelemetryBucketLabel');
		expect(output).toContain('formatTelemetryBucketLabel');
		expect(components).not.toContain('getHours()');
		expect(output).not.toContain('getHours()');
		expect(formatters).toContain('new Intl.DateTimeFormat');
	});

	test('labels UTC day buckets by their keyed day rather than the viewer day', async () => {
		const script = [
			"import { formatTelemetryAxisTick, formatTelemetryBucketLabel } from './src/lib/formatters.ts';",
			"const timestamp = Date.parse('2026-09-01T00:00:00.000Z');",
			'console.log(JSON.stringify({',
			'axis: formatTelemetryAxisTick("day", timestamp),',
			'label: formatTelemetryBucketLabel("day", timestamp),',
			'}));',
		].join('\n');
		const result = Bun.spawnSync([process.execPath, '-e', script], {
			cwd: resolve(import.meta.dir, '../../frontend'),
			env: { ...process.env, TZ: 'America/Chicago' },
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		if (result.exitCode !== 0) {
			throw new Error(new TextDecoder().decode(result.stderr));
		}
		const labels = JSON.parse(new TextDecoder().decode(result.stdout)) as {
			axis: string;
			label: string;
		};

		expect(labels.axis).toContain('Sep');
		expect(labels.axis).toContain('1');
		expect(labels.label).toContain('Sep');
		expect(labels.label).toContain('1');
		expect(labels.label).toContain('UTC');
		expect(labels.label).not.toContain('Aug');
	});
});
