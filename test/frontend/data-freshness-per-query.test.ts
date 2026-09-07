import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	freshnessPresentation,
	type FreshnessQuery,
	refreshCompletionAnnouncement,
} from '../../frontend/src/components/shared/dataFreshness.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const NOW = Date.UTC(2026, 7, 25, 18);

function query(overrides: Partial<FreshnessQuery> = {}): FreshnessQuery {
	return {
		dataUpdatedAt: NOW - 12_000,
		errorUpdatedAt: 0,
		isError: false,
		isFetching: false,
		...overrides,
	};
}

interface RenderedFreshness {
	fetchingSibling: string;
	mixedAge: string;
	mixedError: string;
}

function renderFreshnessStates(): RenderedFreshness {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataFreshness } from './src/components/shared/DataFreshness.tsx';

const now = ${NOW};
Date.now = () => now;
const query = (overrides = {}) => ({
	dataUpdatedAt: now - 12_000,
	errorUpdatedAt: 0,
	isError: false,
	isFetching: false,
	...overrides,
});
const render = (sources) => renderToStaticMarkup(createElement(DataFreshness, {
	label: 'Run data',
	onRefresh: async () => true,
	sources,
}));
const current = { label: 'Runs feed', query: query() };
console.log(JSON.stringify({
	fetchingSibling: render([
		current,
		{ label: 'Pipeline sessions', query: query({ isFetching: true }) },
	]),
	mixedAge: render([
		current,
		{ label: 'Pipeline sessions', query: query({ dataUpdatedAt: now - 46 * 60_000 }) },
		{ label: 'Projects', query: query({ dataUpdatedAt: now - 5 * 60_000 }) },
	]),
	mixedError: render([
		current,
		{ label: 'Pipeline sessions', query: query({ isError: true }) },
	]),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedFreshness;
}

describe('per-query data freshness', () => {
	const rendered = renderFreshnessStates();

	test('summarizes a multi-query surface while keeping each source detail', () => {
		const current = freshnessPresentation(query(), NOW);
		const dormant = freshnessPresentation(query({ dataUpdatedAt: NOW - 46 * 60_000 }), NOW);

		expect(current).toEqual({ kind: 'ready', text: 'Updated 12s ago' });
		expect(dormant).toEqual({ kind: 'ready', text: 'Updated 46m ago' });
		expect(rendered.mixedAge).toMatch(
			/<summary[^>]*>[\s\S]*Run data[\s\S]*Updated 12s ago[\s\S]*3 sources[\s\S]*<\/summary>/u,
		);
		expect(rendered.mixedAge).toContain('Pipeline sessions');
		expect(rendered.mixedAge).toContain('Updated 46m ago');
		expect(rendered.mixedAge).toContain('Projects');
	});

	test('attributes a sibling error without promoting it to the primary summary', () => {
		const current = freshnessPresentation(query(), NOW);
		const failed = freshnessPresentation(query({ isError: true }), NOW);
		const staleFailure = freshnessPresentation(query({ errorUpdatedAt: NOW - 1 }), NOW);
		const summary = rendered.mixedError.match(/<summary[^>]*>[\s\S]*?<\/summary>/u)?.[0];

		expect(current.kind).toBe('ready');
		expect(failed).toEqual({ kind: 'error', text: 'Refresh failed' });
		expect(staleFailure).toEqual({ kind: 'error', text: 'Refresh failed' });
		expect(summary).toContain('Run data');
		expect(summary).toContain('Updated 12s ago');
		expect(summary).not.toContain('Refresh failed');
		expect(rendered.mixedError).toContain('Pipeline sessions');
		expect(rendered.mixedError).toContain('Refresh failed');
	});

	test('keeps the disclosure operable and blocks refresh while any source fetches', () => {
		expect(rendered.fetchingSibling).toContain('<details');
		expect(rendered.fetchingSibling).toContain('<summary');
		expect(rendered.fetchingSibling).toContain('marker:content-none');
		expect(rendered.fetchingSibling).toContain('Pipeline sessions');
		expect(rendered.fetchingSibling).toContain('Refreshing…');
		expect(rendered.fetchingSibling).toMatch(/<button[^>]*disabled=""/u);
	});

	test('keeps the readout and refresh control together at phone widths', () => {
		expect(rendered.mixedAge).toContain(
			'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center',
		);
		expect(rendered.mixedAge).toContain('sm:w-auto');
		expect(rendered.mixedAge).not.toContain('flex-wrap');
		expect(rendered.mixedAge).toContain('max-sm:right-auto max-sm:left-0');
	});

	test('announces one completion only for an operator-triggered refresh', async () => {
		const source = await Bun.file(
			resolve(FRONTEND_ROOT, 'src/components/shared/DataFreshness.tsx'),
		).text();

		expect(refreshCompletionAnnouncement('Run data', true)).toBe('Run data updated.');
		expect(refreshCompletionAnnouncement('Run data', false)).toBe(
			'Run data failed to refresh.',
		);
		expect(source.match(/aria-live="polite"/gu)).toHaveLength(1);
		expect(source).toContain('.then(onRefresh)');
		expect(source).not.toContain('useEffect');
	});

	test('names every represented query and refreshes the full profile matrix set', async () => {
		const [dashboard, matrix, projects, runs, runsHook] = await Promise.all([
			Bun.file(resolve(FRONTEND_ROOT, 'src/pages/dashboard/DashboardPage.tsx')).text(),
			Bun.file(
				resolve(FRONTEND_ROOT, 'src/pages/projects/profileMatrix/ProfileMatrixPage.tsx'),
			).text(),
			Bun.file(resolve(FRONTEND_ROOT, 'src/pages/projects/ProjectsPage.tsx')).text(),
			Bun.file(resolve(FRONTEND_ROOT, 'src/pages/runs/RunsPage.tsx')).text(),
			Bun.file(resolve(FRONTEND_ROOT, 'src/pages/runs/useRunsPage.ts')).text(),
		]);

		for (const label of [
			'Projects',
			'Runs',
			'Fleet summary',
			'Suggestions',
			'Director cycles',
		]) {
			expect(dashboard).toContain(`label: '${label}'`);
		}
		for (const label of ['Runs feed', 'Pipeline sessions', 'Projects']) {
			expect(runs).toContain(`label: '${label}'`);
		}
		expect(projects).toContain("label: 'Projects'");
		expect(matrix).toContain("label: 'Project profiles'");
		expect(matrix).toContain("label: 'Audit previews'");
		expect(dashboard).toContain('Promise.allSettled');
		expect(matrix).toContain('Promise.allSettled');
		expect(runsHook).toContain('Promise.allSettled');
		expect(matrix).toContain('projects.refetch({ throwOnError: true })');
		expect(matrix).toContain('previews.refetch({ throwOnError: true })');
		for (const queryKey of ["['runs']", "['pipeline-sessions']", "['projects']"]) {
			expect(runsHook).toContain(`queryKey: ${queryKey}`);
		}
	});
});
