import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

interface RenderedMetrics {
	emeraldTone: string;
	inline: string;
	region: string;
	underway: string;
	zero: string;
}

function renderMetrics(): RenderedMetrics {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Metric } from './src/components/shared/Metric.tsx';
import { toneText } from './src/lib/tones.ts';

function render(props) {
	return renderToStaticMarkup(createElement(Metric, props));
}

console.log(JSON.stringify({
	emeraldTone: toneText.emerald,
	inline: render({ label: 'Inline reading', value: 4 }),
	region: render({ headingLevel: 2, label: 'Region reading', value: 4 }),
	underway: render({ label: 'Completed', tone: 'emerald', value: '40%' }),
	zero: render({ label: 'Completed', tone: 'emerald', value: '0%' }),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedMetrics;
}

describe('Metric semantics', () => {
	test('uses a heading only when the tile labels a standalone region', () => {
		const rendered = renderMetrics();

		expect(rendered.inline).toContain('<span class="min-w-0">Inline reading</span>');
		expect(rendered.inline).not.toContain('<h2');
		expect(rendered.region).toContain('<h2 class="min-w-0">Region reading</h2>');
	});

	test('renders formatted zero completion neutrally and progress as success', () => {
		const rendered = renderMetrics();

		expect(rendered.zero).toContain('text-foreground');
		for (const token of rendered.emeraldTone.split(' ')) {
			expect(rendered.zero).not.toContain(token);
			expect(rendered.underway).toContain(token);
		}
	});

	test('aligns Dashboard metric cards while keeping their content top-aligned', async () => {
		const source = await Bun.file('frontend/src/pages/dashboard/DashboardMetrics.tsx').text();

		expect(source).toContain(
			'grid items-stretch gap-4 @min-[20rem]:grid-cols-2 @min-[61rem]:grid-cols-4',
		);
		expect(source).toContain('Priority Health uses the extra depth for its progress footer');
	});

	test('does not infer Dashboard attention from a non-zero count', async () => {
		const source = await Bun.file('frontend/src/pages/dashboard/DashboardMetrics.tsx').text();

		expect(source).not.toContain("pendingSuggestionCount > 0 ? 'amber'");
		expect(source).toContain("activeRunCount > 0 ? 'teal' : 'neutral'");
	});
});
