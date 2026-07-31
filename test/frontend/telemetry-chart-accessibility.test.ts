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
		expect(invocations).toContain('aria-hidden="true" class="flex h-40');
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

	test('exposes every output bucket and metric in semantic tables', () => {
		const { labels, lines, tokens } = renderCharts();

		expect(lines).toContain('aria-labelledby="telemetry-output-lines-chart-heading"');
		expect(lines).toContain('Line changes by time bucket');
		expect(lines).toContain('aria-hidden="true" class="relative"');
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
});
