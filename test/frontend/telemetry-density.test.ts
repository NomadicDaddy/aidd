import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const TELEMETRY_DIR = join(FRONTEND_ROOT, 'src', 'pages', 'telemetry');

/**
 * Renders the telemetry surfaces this feature reshaped through react-dom/server and returns each
 * markup string. Structure claims — a suppressed bar, a title-cased badge, a column that drops
 * below `md` — are only worth asserting against what the components actually emit.
 */
interface Rendered {
	disclosure: string;
	leaderboardRanked: string;
	leaderboardTied: string;
	summary: string;
	table: string;
	tableRunless: string;
}

function renderSurfaces(): Rendered {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { LeaderboardCard } from './src/pages/telemetry/TelemetryComponents.tsx';
import { InvocationsTable } from './src/pages/telemetry/InvocationsTable.tsx';
import { TelemetryDisclosure } from './src/pages/telemetry/TelemetryDisclosure.tsx';
import { TelemetrySummary } from './src/pages/telemetry/TelemetrySummary.tsx';

function row(resourceId, total) {
	return {
		avgDurationMs: 1000,
		completed: total,
		failed: 0,
		flagged: 0,
		killed: 0,
		lastUsedAt: 1700000000000,
		nested: 0,
		noWork: 0,
		resourceId,
		resourceName: resourceId,
		resourceType: 'skill',
		running: 0,
		stopped: 0,
		topLevel: total,
		total,
		warnings: 0,
	};
}

function invocation(overrides) {
	return {
		argsPresent: false,
		backend: null,
		completedAt: null,
		durationMs: 1000,
		errorMessage: null,
		exitCode: null,
		id: 'inv_1',
		model: null,
		parentInvocationId: null,
		parentResourceId: null,
		parentResourceName: null,
		parentResourceType: null,
		projectName: 'demo',
		projectPath: 'd:/applications/demo',
		resourceId: 'demo-skill',
		resourceName: 'Demo skill',
		resourceType: 'skill',
		runExitCode: null,
		runId: null,
		runStatus: null,
		runStopReason: null,
		runSummary: null,
		sessionId: null,
		source: 'web',
		startedAt: 1700000000000,
		status: 'failed',
		...overrides,
	};
}

const totals = { completed: 1, failed: 1, flagged: 0, killed: 0, nested: 4, noWork: 0, running: 1, stopped: 0, topLevel: 8, total: 12, warnings: 6 };

function render(element) {
	return renderToStaticMarkup(createElement(MemoryRouter, null, element));
}

console.log(JSON.stringify({
	disclosure: render(createElement(TelemetryDisclosure)),
	leaderboardRanked: render(createElement(LeaderboardCard, { rows: [row('a', 9), row('b', 2)] })),
	leaderboardTied: render(createElement(LeaderboardCard, { rows: [row('a', 1), row('b', 1)] })),
	summary: render(createElement(TelemetrySummary, { totals })),
	tableRunless: render(createElement(InvocationsTable, { invocations: [invocation({ id: 'plain' })] })),
	table: render(createElement(InvocationsTable, {
		invocations: [
			invocation({ id: 'echo', runExitCode: 0, runStatus: 'completed', status: 'completed' }),
			invocation({ id: 'dirty', runExitCode: 0, runStatus: 'completed', runSummary: 'uncommitted_source_files: src/a.ts', status: 'completed' }),
			invocation({ id: 'gate', runExitCode: 1, runStatus: 'failed', runStopReason: 'blocked', status: 'failed' }),
		],
	})),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as Rendered;
}

const rendered = renderSurfaces();

async function telemetrySource(file: string): Promise<string> {
	return readFile(join(TELEMETRY_DIR, file), 'utf8');
}

describe('telemetry surfaces stay on the token and type scales', () => {
	test('no telemetry file paints from the raw palette or invents a type step', async () => {
		const files = [
			'ChartAxes.tsx',
			'InvocationDetails.tsx',
			'InvocationsTable.tsx',
			'OutputTimeseriesChart.tsx',
			'TelemetryChartTable.tsx',
			'TelemetryComponents.tsx',
			'TelemetryDisclosure.tsx',
			'TelemetryPage.tsx',
			'TelemetrySummary.tsx',
		];
		const sources = await Promise.all(files.map(telemetrySource));

		for (const [index, source] of sources.entries()) {
			// `text-neutral-500` on the card surface measures ~3.9:1; `--muted-foreground` clears
			// 4.5:1. Every caption on this page was on the failing value.
			expect(
				`${files[index]}: ${/(?:^|[^-\w])(?:bg|text|border)-(?:neutral|slate|teal|zinc|gray)-\d/.test(source)}`,
			).toBe(`${files[index]}: false`);
			// `text-[0.65rem]` and `text-[0.7rem]` are the same step as the declared `text-2xs`,
			// spelled three different ways.
			expect(`${files[index]}: ${/text-\[0\.\d+rem\]/.test(source)}`).toBe(
				`${files[index]}: false`,
			);
		}
	});

	test('the field-label micro step is declared once and consumed, not re-typed', async () => {
		const [typography, details] = await Promise.all([
			readFile(join(FRONTEND_ROOT, 'src', 'lib', 'typography.ts'), 'utf8'),
			telemetrySource('InvocationDetails.tsx'),
		]);

		expect(typography).toContain(
			"export const microLabelClass = 'text-2xs font-medium tracking-wide uppercase'",
		);
		expect(details).toContain("import { microLabelClass } from '../../lib/typography.ts'");
		expect(details).toContain('${microLabelClass}');
	});

	test('the segmented control track re-themes with the cards it sits in', async () => {
		const control = await readFile(
			join(FRONTEND_ROOT, 'src', 'components', 'ui', 'segmented-control.tsx'),
			'utf8',
		);

		expect(control).toContain('rounded-md border border-border bg-muted p-1');
		expect(control).not.toContain('bg-white');
		expect(control).not.toMatch(/neutral-\d/);
	});
});

describe('telemetry lets the data lead', () => {
	test('the privacy card folds its four columns behind a summary that still states the promise', () => {
		expect(rendered.disclosure).toContain('<details');
		expect(rendered.disclosure).toContain('What aidd records');
		// The promise itself is the point of the card, so it stays outside the fold.
		const summaryEnd = rendered.disclosure.indexOf('</summary>');
		expect(summaryEnd).toBeGreaterThan(0);
		expect(rendered.disclosure.slice(0, summaryEnd)).toContain(
			'All telemetry stays in this local aidd installation',
		);
		// The four dense categories are inside the fold.
		expect(rendered.disclosure.slice(summaryEnd)).toContain('AI call diagnostics');
		// The destination link is not part of the statement and is never folded away.
		expect(rendered.disclosure.slice(summaryEnd)).toContain('View system and browser metrics');
	});

	test('the summary tiles anchor their values to a common baseline and pack at tablet width', async () => {
		const summary = await telemetrySource('TelemetrySummary.tsx');

		expect(summary).toContain('flex h-full flex-col justify-between gap-1');
		expect(summary).toContain('sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8');
		expect(rendered.summary).toContain('flex h-full flex-col justify-between');
	});

	test('the two chart columns size to their own content', async () => {
		const page = await telemetrySource('TelemetryPage.tsx');

		expect(page).toContain(
			'grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]',
		);
	});

	test('the filter-driven output message is the shared empty surface with a way out', async () => {
		const page = await telemetrySource('TelemetryPage.tsx');

		expect(page).toContain('<EmptyState');
		expect(page).toContain("onClick={() => setTypeFilter('all')}");
		expect(page).not.toContain('border-dashed border-border p-4 text-xs');
	});

	test('the diverging chart stops reserving half its height for an arm that never fills it', async () => {
		const output = await telemetrySource('OutputTimeseriesChart.tsx');

		expect(output).toContain('flex h-32 gap-1');
		expect(output).not.toContain('flex h-40 gap-1');
	});
});

describe('leaderboard rows', () => {
	test('nest by fill rather than by a second border of the card’s own weight', () => {
		expect(rendered.leaderboardRanked).toContain('bg-muted/90 shadow-inner');
		expect(rendered.leaderboardRanked).not.toContain('rounded-md border border-border p-3');
	});

	test('draw a bar only when the rows actually rank', () => {
		// Two rows at 9 and 2: the bar carries the comparison.
		expect(rendered.leaderboardRanked).toContain('rounded-full bg-accent');
		// Two rows both at 1: ten identical full-width bars said nothing the counts did not.
		expect(rendered.leaderboardTied).not.toContain('rounded-full bg-accent');
		expect(rendered.leaderboardTied).toContain('>1<');
	});
});

describe('recent invocations table', () => {
	test('reports one casing for a status regardless of whether a run backs the row', () => {
		// Scoped to the Status badge: the Inspect panel legitimately prints the raw lowercase value
		// under "Raw invocation status", and that is the one place it belongs.
		const badgeText = /ring-inset[^"]*"[^>]*>([^<]+)</;

		expect(rendered.tableRunless.match(badgeText)?.[1]).toBe('Failed');
	});

	test('keeps the raw status line only where it adds information', () => {
		const lines = [
			...rendered.table.matchAll(
				/class="mt-0[.]5 block text-2xs text-muted-foreground">([^<]+)</g,
			),
		].map((match) => match[1]);

		// "Completed" and "Completed · dirty tree" both echo the raw "completed" underneath them.
		// "Blocked: gate" over "failed" is the one pairing that carries two different facts.
		expect(rendered.table).toContain('>Completed<');
		expect(rendered.table).toContain('Completed · dirty tree');
		expect(rendered.table).toContain('Blocked: gate');
		expect(lines).toEqual(['failed']);
		expect(rendered.tableRunless).not.toMatch(
			/class="mt-0[.]5 block text-2xs text-muted-foreground"/,
		);
	});

	test('drops the two repeatable columns below md so Status and Details stay on screen', () => {
		// Header and body cells both, or the table shifts by a column at the breakpoint.
		expect(rendered.table.match(/hidden md:table-cell/g)?.length).toBe(2 + 2 * 3);
		expect(rendered.table).toContain('whitespace-nowrap');
	});

	test('sits in the scrollport that signals and exposes its overflow', async () => {
		const table = await telemetrySource('InvocationsTable.tsx');

		expect(table).toContain('<OverflowScroller');
		expect(table).not.toContain('<div className="overflow-x-auto">');
		expect(rendered.table).toContain('data-overflow-scroller');
	});

	test('the Inspect panel is a sunken card, not a hand-rolled well', async () => {
		const details = await telemetrySource('InvocationDetails.tsx');

		expect(details).toContain(
			'<Card className="mt-2 w-[min(42rem,75vw)] p-3" variant="sunken">',
		);
		expect(details).toContain('text-xs font-medium text-accent hover:underline');
		expect(rendered.table).toContain('bg-muted/90 shadow-inner');
	});
});
