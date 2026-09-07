import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { listProjectCosts } from '../../frontend/src/api/telemetry.ts';
import {
	formatProjectCost,
	projectCostCoverage,
	totalProjectCost,
} from '../../frontend/src/pages/telemetry/projectCostPresenter.ts';

const FRONTEND = resolve(import.meta.dir, '../../frontend');

type FetchFn = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

function withFetch<T>(fn: FetchFn, run: () => Promise<T>): Promise<T> {
	const original = globalThis.fetch;
	globalThis.fetch = fn as typeof fetch;
	return run().finally(() => {
		globalThis.fetch = original;
	});
}

interface RenderedProjectCost {
	empty: string;
	failed: string;
	loading: string;
	queryKeys: string;
	rows: string;
}

/**
 * The real card in each of its states, plus the query keys the hook registers.
 *
 * The keys are read out of the query cache rather than off the source: what matters is that two
 * windows produce two distinct cache entries, so switching 24h/7d/30d/all actually re-queries the
 * endpoint instead of re-reading the previous window's answer.
 */
function renderProjectCost(): RenderedProjectCost {
	const script = [
		"import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
		"import { createElement as h } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { useTelemetryProjects } from './src/hooks/useTelemetry.ts';",
		"import { ProjectCostSection } from './src/pages/telemetry/ProjectCostSection.tsx';",
		'const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });',
		'const render = (element) => renderToStaticMarkup(h(QueryClientProvider, { client }, element));',
		'const section = (props) =>',
		'\trender(h(ProjectCostSection, { isError: false, isLoading: false, onRetry: () => {}, ...props }));',
		'const rows = [',
		'\t{',
		'\t\tcostUsd: 4.5, costedInvocationCount: 2, invocationCount: 3,',
		"\t\tlastInvocationAt: Date.now() - 3600000, projectName: 'Beta', projectPath: 'd:/apps/beta',",
		'\t},',
		'\t{',
		'\t\tcostUsd: 0, costedInvocationCount: 0, invocationCount: 1,',
		"\t\tlastInvocationAt: Date.now() - 7200000, projectName: 'Gamma', projectPath: 'd:/apps/gamma',",
		'\t},',
		'];',
		'function Probe() {',
		"\tuseTelemetryProjects({ type: 'skill', windowMs: 86400000 });",
		"\tuseTelemetryProjects({ type: 'skill', windowMs: 2592000000 });",
		'\treturn null;',
		'}',
		'render(h(Probe));',
		'console.log(JSON.stringify({',
		'\tempty: section({ rows: [] }),',
		'\tfailed: section({ isError: true, rows: [] }),',
		'\tloading: section({ isLoading: true, rows: [] }),',
		'\tqueryKeys: JSON.stringify(client.getQueryCache().getAll().map((query) => query.queryKey)),',
		'\trows: section({ rows }),',
		'}));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedProjectCost;
}

describe('project cost API client', () => {
	test('asks the projects endpoint for the selected window and type', async () => {
		const requested: string[] = [];
		const rows = await withFetch(
			async (input) => {
				requested.push(String(input));
				return new Response(
					JSON.stringify({
						projects: [
							{
								costUsd: 1.5,
								costedInvocationCount: 1,
								invocationCount: 2,
								lastInvocationAt: 1_700_000_000_000,
								projectName: 'aidd',
								projectPath: 'd:/applications/aidd',
							},
						],
					}),
					{ headers: { 'content-type': 'application/json' }, status: 200 },
				);
			},
			async () => listProjectCosts({ type: 'skill', windowMs: 86_400_000 }),
		);

		expect(requested).toEqual(['/api/v1/telemetry/projects?type=skill&windowMs=86400000']);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.projectPath).toBe('d:/applications/aidd');
	});

	test('a second window is a second request, not the first answer reused', async () => {
		const requested: string[] = [];
		await withFetch(
			async (input) => {
				requested.push(String(input));
				return new Response(JSON.stringify({ projects: [] }), {
					headers: { 'content-type': 'application/json' },
					status: 200,
				});
			},
			async () => {
				await listProjectCosts({ windowMs: 86_400_000 });
				await listProjectCosts({ windowMs: 2_592_000_000 });
				await listProjectCosts();
			},
		);

		expect(requested).toEqual([
			'/api/v1/telemetry/projects?windowMs=86400000',
			'/api/v1/telemetry/projects?windowMs=2592000000',
			'/api/v1/telemetry/projects',
		]);
	});
});

describe('project cost presentation', () => {
	test('a project the backends never priced is unknown, not free', () => {
		expect(formatProjectCost({ costedInvocationCount: 0, costUsd: 0 })).toBe('Unknown');
		expect(projectCostCoverage({ costedInvocationCount: 0, invocationCount: 4 })).toBe(
			'no reported cost',
		);
	});

	test('real spend below a cent is not rounded down to nothing either', () => {
		expect(formatProjectCost({ costedInvocationCount: 1, costUsd: 0.002 })).toBe('<$0.01');
	});

	test('formats reported spend and says how much of the window it covers', () => {
		expect(formatProjectCost({ costedInvocationCount: 2, costUsd: 4.5 })).toBe('$4.50');
		expect(projectCostCoverage({ costedInvocationCount: 2, invocationCount: 3 })).toBe(
			'2 of 3 priced',
		);
		expect(projectCostCoverage({ costedInvocationCount: 3, invocationCount: 3 })).toBe(
			'all priced',
		);
	});

	test('the window total is unknown only when no project reported anything', () => {
		expect(
			totalProjectCost([
				{ costedInvocationCount: 0, costUsd: 0 },
				{ costedInvocationCount: 2, costUsd: 4.5 },
			]),
		).toBe('$4.50');
		expect(totalProjectCost([{ costedInvocationCount: 0, costUsd: 0 }])).toBe('Unknown');
		expect(totalProjectCost([])).toBe('Unknown');
	});
});

describe('the Cost by project card', () => {
	const rendered = renderProjectCost();

	test('lists each project with its own spend and coverage', () => {
		expect(rendered.rows).toContain('Beta');
		expect(rendered.rows).toContain('$4.50');
		expect(rendered.rows).toContain('2 of 3 priced');
		expect(rendered.rows).toContain('D:/apps/beta');
	});

	test('a project with invocations but no reported cost reads as unknown', () => {
		expect(rendered.rows).toContain('Gamma');
		expect(rendered.rows).toContain('Unknown');
		expect(rendered.rows).toContain('no reported cost');
		// The whole point of costedInvocationCount: an unpriced project must never claim $0.00.
		expect(rendered.rows).not.toContain('$0.00');
	});

	test('tells apart loading, a failed request, and a window with no projects', () => {
		expect(rendered.loading).toContain('Loading project cost');
		expect(rendered.failed).toContain('Project cost could not be read.');
		expect(rendered.empty).toContain('No project invocations in the selected filters.');
		expect(rendered.failed).not.toContain('No project invocations');
		expect(rendered.empty).not.toContain('could not be read');
	});

	test('keeps the card visible in every state, so it never hides the surface', () => {
		for (const html of [rendered.empty, rendered.failed, rendered.loading, rendered.rows]) {
			expect(html).toContain('Cost by project');
		}
	});

	test('gives each window its own query key', () => {
		const keys = JSON.parse(rendered.queryKeys) as unknown[][];

		expect(keys).toEqual([
			['telemetry', 'projects', 'skill', 86_400_000],
			['telemetry', 'projects', 'skill', 2_592_000_000],
		]);
	});
});
