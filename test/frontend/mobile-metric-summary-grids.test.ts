import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

function readSource(path: string): Promise<string> {
	return Bun.file(resolve(frontendRoot, 'src', path)).text();
}

function renderMetricCounts(): Record<string, string> {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Metric } from './src/components/shared/Metric.tsx';

function render(count, props) {
	return renderToStaticMarkup(
		createElement(
			'div',
			null,
			...Array.from({ length: count }, (_, index) =>
				createElement(Metric, {
					detail: 'Complete operational context remains visible',
					key: index,
					label: 'Long operational outcome label ' + index,
					value: '12345678901234567890-' + index,
					...props,
				}),
			),
		),
	);
}

console.log(JSON.stringify({
	dashboard: render(4, { compactOnMobile: true }),
	interview: render(3, { compactOnMobile: true }),
	telemetry: render(8, { size: 'compact' }),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as Record<string, string>;
}

function occurrences(value: string, pattern: RegExp): number {
	return value.match(pattern)?.length ?? 0;
}

describe('mobile metric summary grids', () => {
	test('retains complete long labels, values, and details in rendered output', () => {
		const rendered = renderMetricCounts();
		for (const [surface, count] of [
			['dashboard', 4],
			['interview', 3],
			['telemetry', 8],
		] as const) {
			const markup = rendered[surface] ?? '';
			expect(occurrences(markup, /font-display/gu)).toBe(count);
			expect(markup).toContain('Long operational outcome label 0');
			expect(markup).toContain('12345678901234567890-0');
			expect(markup).toContain('Complete operational context remains visible');
		}
	});

	test('reuses the compact Metric step only below sm when requested', () => {
		const rendered = renderMetricCounts();
		expect(rendered.dashboard).toContain('p-3 sm:p-4');
		expect(rendered.dashboard).toContain('text-lg sm:text-2xl');
		expect(rendered.interview).toContain('p-3 sm:p-4');
		expect(rendered.telemetry).toContain('p-3');
		expect(rendered.telemetry).not.toContain('sm:p-4');
	});

	test('uses 390px container arrangements while retaining the 320px fallback', async () => {
		const [dashboard, interview, telemetry] = await Promise.all([
			readSource('pages/dashboard/DashboardPage.tsx'),
			readSource('pages/projects/detail/InterviewTab.tsx'),
			readSource('pages/telemetry/TelemetrySummary.tsx'),
		]);

		expect(dashboard).toContain('grid gap-4 @min-[22rem]:grid-cols-2 @min-[61rem]:grid-cols-4');
		expect(interview).toContain('grid gap-4 @min-[22rem]:grid-cols-3');
		expect(telemetry).toContain(
			'grid gap-3 @min-[22rem]:grid-cols-2 @min-[45rem]:grid-cols-4 @min-[61rem]:grid-cols-8',
		);
		expect(dashboard.match(/<Metric/gu)).toHaveLength(4);
		expect(interview.match(/<Metric/gu)).toHaveLength(3);
		expect(telemetry.match(/<Metric/gu)).toHaveLength(11);
		expect(telemetry.match(/size="compact"/gu)).toHaveLength(8);
		for (const source of [dashboard, interview, telemetry]) {
			expect(source).toContain('@container');
		}
	});
});
