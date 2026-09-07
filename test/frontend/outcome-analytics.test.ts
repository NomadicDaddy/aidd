import { beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

interface RenderedOutcomeAnalytics {
	cost: string;
	rate: string;
	revisions: string;
	uncaptured: string;
}

function renderOutcomeAnalytics(): RenderedOutcomeAnalytics {
	const definition = {
		applicableBucketCount: 1,
		applicableProjectCount: 2,
		changePotential: null,
		enabled: true,
		freshReportCount: 0,
		missingReportCount: 0,
		name: 'SECURITY',
		outcome: {
			acceptanceRate: { denominator: 4, numerator: 3, value: 0.75 },
			costPerAcceptedFinding: {
				acceptedFindings: 3,
				capturedRuns: 2,
				costedAcceptedFindings: 2,
				totalRuns: 4,
				value: 2.5,
			},
			degradedProjects: 1,
			recurrenceRate: { denominator: 3, numerator: 1, value: 1 / 3 },
		},
		path: 'audits/SECURITY.md',
		staleReportCount: 0,
		updatedAt: null,
	};
	const revisions = [
		{
			avgDurationMs: 1_250,
			cachedTokens: 40,
			completed: 2,
			failed: 0,
			flagged: 0,
			inputTokens: 200,
			killed: 0,
			lastUsedAt: 10,
			noWork: 0,
			outputTokens: 50,
			reasoningTokens: 20,
			resourceSha256: 'a'.repeat(64),
			revertRate: { denominator: 2, numerator: 1, value: 0.5 },
			running: 0,
			runsWithTokenData: 2,
			stopped: 0,
			total: 2,
			totalTokens: 250,
			warnings: 0,
		},
		{
			avgDurationMs: null,
			cachedTokens: 0,
			completed: 0,
			failed: 1,
			flagged: 0,
			inputTokens: 0,
			killed: 0,
			lastUsedAt: 20,
			noWork: 0,
			outputTokens: 0,
			reasoningTokens: 0,
			resourceSha256: 'b'.repeat(64),
			revertRate: { denominator: 0, numerator: 0, value: null },
			running: 0,
			runsWithTokenData: 0,
			stopped: 0,
			total: 1,
			totalTokens: 0,
			warnings: 0,
		},
	];
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { OutcomeCostCell, OutcomeRateCell } from './src/pages/audits/tabs/catalogCells.tsx';",
		"import { SkillRevisionComparison } from './src/pages/telemetry/InvocationDetails.tsx';",
		`const definition = ${JSON.stringify(definition)};`,
		`const revisions = ${JSON.stringify(revisions)};`,
		"const rate = renderToStaticMarkup(createElement(OutcomeRateCell, { degradedProjects: definition.outcome.degradedProjects, denominatorLabel: 'decided', rate: definition.outcome.acceptanceRate }));",
		"const uncaptured = renderToStaticMarkup(createElement(OutcomeRateCell, { denominatorLabel: 'remediated', rate: { denominator: 0, numerator: 0, value: null } }));",
		'const cost = renderToStaticMarkup(createElement(OutcomeCostCell, { definition }));',
		'const revisionCards = renderToStaticMarkup(createElement(SkillRevisionComparison, { revisions }));',
		'console.log(JSON.stringify({ cost, rate, revisions: revisionCards, uncaptured }));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedOutcomeAnalytics;
}

let rendered: RenderedOutcomeAnalytics;

beforeAll(() => {
	rendered = renderOutcomeAnalytics();
});

describe('outcome analytics presentation', () => {
	test('renders rates and cost with their coverage denominators', () => {
		expect(rendered.rate).toContain('75%');
		expect(rendered.rate).toContain('3/4 decided');
		expect(rendered.cost).toContain('$2.50');
		expect(rendered.cost).toContain('2/3 accepted · 2/4 costed');
	});

	test('renders an em dash for an uncaptured rate and a coverage warning for unreadable ledgers', () => {
		expect(rendered.uncaptured).toContain('—');
		expect(rendered.uncaptured).toContain('0/0 remediated');
		expect(rendered.uncaptured).not.toContain('unreadable');
		expect(rendered.rate).toContain('1 project unreadable');
	});

	test('renders skill revisions side by side with outcome, duration, and token facts', () => {
		expect(rendered.revisions).toContain('@min-[42rem]:grid-cols-2');
		expect(rendered.revisions).toContain('aaaaaaaaaaaa');
		expect(rendered.revisions).toContain('bbbbbbbbbbbb');
		expect(rendered.revisions).toContain('2 completed');
		expect(rendered.revisions).toContain('1 failed');
		expect(rendered.revisions).toContain('250 total');
		expect(rendered.revisions).toContain('Revert rate');
		expect(rendered.revisions).toContain('50% · 1/2 inspected');
		expect(rendered.revisions).toContain('1s');
	});
});
