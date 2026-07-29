import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderProjectUsagePanel(): string {
	const usage = {
		byExecutionTarget: [
			{
				backend: 'native',
				cachedTokens: 700_000,
				inputTokens: 1_000_000,
				model: 'glm-5.2',
				outputTokens: 200_000,
				provider: 'zhipu',
				reasoningTokens: 50_000,
				reportedCostUsd: 0,
				runCount: 2,
				runsWithReportedCost: 0,
				runsWithTokenUsage: 2,
				totalTokens: 1_200_000,
			},
		],
		byMode: [
			{
				cachedTokens: 700_000,
				inputTokens: 1_000_000,
				mode: 'coding',
				outputTokens: 200_000,
				reasoningTokens: 50_000,
				reportedCostUsd: 12.5,
				runCount: 3,
				runsWithReportedCost: 1,
				runsWithTokenUsage: 2,
				totalTokens: 1_200_000,
			},
		],
		recentDailyTokens: [],
		totals: {
			cachedTokens: 700_000,
			inputTokens: 1_000_000,
			outputTokens: 200_000,
			reasoningTokens: 50_000,
			reportedCostUsd: 12.5,
			runCount: 3,
			runsWithReportedCost: 1,
			runsWithTokenUsage: 2,
			totalTokens: 1_200_000,
		},
	};
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ProjectUsagePanel } from './src/pages/projects/detail/ProjectUsagePanel.tsx';",
		`const usage = ${JSON.stringify(usage)};`,
		'console.log(renderToStaticMarkup(createElement(ProjectUsagePanel, { usage })));',
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
	return new TextDecoder().decode(result.stdout).trim();
}

describe('ProjectUsagePanel', () => {
	test('renders honest lifetime totals and both requested breakdowns', () => {
		const html = renderProjectUsagePanel();

		expect(html).toContain('AI usage');
		expect(html).toContain('$12.50');
		expect(html).toContain('1/3 runs reported dollars');
		expect(html).toContain('2 runs have unknown cost');
		expect(html).toContain('aria-label="Project usage by execution target"');
		expect(html).toContain('aria-label="CLI native, Model glm-5.2, Provider zhipu"');
		expect(html).toContain('aria-label="Project usage by run mode"');
		expect(html).toContain('coding');
		expect(html).toContain('Cached tokens');
		expect(html).toContain('not added twice');
	});
});
