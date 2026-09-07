import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { DiaryEntry, ProjectLocalRun } from '../../frontend/src/api/types.ts';

import {
	buildHistoryEvents,
	filterHistoryEvents,
	HISTORY_FILTERS,
	historyFilterCounts,
	historyKindLabels,
	historyKindTones,
} from '../../frontend/src/pages/projects/detail/historyTimeline.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const PROJECT_PATH = 'D:\\applications\\aidd';

const baseRun = {
	aiddDirty: null,
	aiddRevision: null,
	aiddVersion: null,
	aiSummary: null,
	artifactWarnings: [],
	backend: 'codex',
	backendExitCode: 0,
	commitsCreated: [],
	commitsCreatedCount: 0,
	completedFeatures: [],
	durationMs: 60_000,
	executionMode: null,
	exitCode: 0,
	filesCreated: 0,
	filesEdited: 1,
	mode: 'coding',
	model: 'gpt-5',
	phase: 'coding',
	provider: null,
	reasoningEffort: null,
	residualDirtySourceFiles: [],
	residualUntrackedFeatureDirs: [],
	runLedgerDirty: false,
	scopeOverrun: false,
	source: 'cli',
	stopReason: 'completed',
	summary: 'Completed one feature.',
	triumvirateRoles: null,
	unattributedDirtySourceFiles: [],
} as unknown as ProjectLocalRun;

function run(runId: string, endedAt: string): ProjectLocalRun {
	return {
		...baseRun,
		endedAt,
		runId,
		startedAt: new Date(Date.parse(endedAt) - 60_000).toISOString(),
	};
}

function diary(id: string, title: string, writtenAt: string): DiaryEntry {
	return {
		bodyMd: `# ${title}`,
		// The calendar day the entry is *about*, deliberately not the time it was written.
		date: writtenAt.slice(0, 10),
		fileMtimeMs: Date.parse(writtenAt),
		generatedBy: null,
		id,
		phase: null,
		projectId: 'aidd',
		projectName: 'aidd',
		projectPath: PROJECT_PATH,
		summary: `Summary for ${title}`,
		title,
	};
}

interface RenderedHistory {
	empty: string;
	failed: string;
	loading: string;
	loaded: string;
	morePages: string;
}

function renderHistory(): RenderedHistory {
	const script = String.raw`
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { HistoryTab } from './src/pages/projects/detail/HistoryTab.tsx';

const projectPath = 'D:\\applications\\aidd';
const queryKey = ['diary', 'entries', projectPath];

const baseRun = {
	aiddDirty: null,
	aiddRevision: null,
	aiddVersion: null,
	aiSummary: null,
	artifactWarnings: [],
	backend: 'codex',
	backendExitCode: 0,
	commitsCreated: [],
	commitsCreatedCount: 0,
	completedFeatures: [],
	durationMs: 60000,
	executionMode: null,
	exitCode: 0,
	filesCreated: 0,
	filesEdited: 1,
	mode: 'coding',
	model: 'gpt-5',
	phase: 'coding',
	provider: null,
	reasoningEffort: null,
	residualDirtySourceFiles: [],
	residualUntrackedFeatureDirs: [],
	runLedgerDirty: false,
	scopeOverrun: false,
	source: 'cli',
	stopReason: 'completed',
	summary: 'Completed one feature.',
	triumvirateRoles: null,
	unattributedDirtySourceFiles: [],
};
const localRuns = [
	{ ...baseRun, endedAt: '2026-09-01T19:00:00.000Z', runId: 'run-late', startedAt: '2026-09-01T18:59:00.000Z' },
	{ ...baseRun, endedAt: '2026-09-01T18:00:00.000Z', runId: 'run-early', startedAt: '2026-09-01T17:59:00.000Z' },
];
const entries = [
	{
		bodyMd: '# Between the runs',
		date: '2026-09-01',
		fileMtimeMs: Date.parse('2026-09-01T18:30:00.000Z'),
		generatedBy: null,
		id: '2026-09-01|d:\\applications\\aidd',
		phase: 'Frontend',
		projectId: 'aidd',
		projectName: 'aidd',
		projectPath,
		summary: 'What the afternoon was spent on.',
		title: 'Between the runs',
	},
];

function render(seed) {
	// retryOnMount:false is what makes a cached failure observable in a server render: without it
	// react-query optimistically reports a data-less error query as pending, because on mount it
	// would retry. The tab is asserting how it renders each settled state, not the retry policy.
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, retryOnMount: false } },
	});
	seed(client);
	const view = createElement(HistoryTab, {
		features: [],
		localIterations: [],
		localRuns,
		projectId: 'aidd',
		projectPath,
	});
	return renderToStaticMarkup(
		createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, view)),
	);
}

function page(pageEntries, nextCursor) {
	return (client) => {
		client.setQueryData(queryKey, {
			pageParams: [undefined],
			pages: [{ entries: pageEntries, nextCursor }],
		});
	};
}

console.log(JSON.stringify({
	empty: render(page([], null)),
	failed: render((client) => {
		const query = client.getQueryCache().build(client, { queryKey });
		query.setState({ error: new Error('diary offline'), fetchStatus: 'idle', status: 'error' });
	}),
	loaded: render(page(entries, null)),
	loading: render(() => {}),
	morePages: render(page(entries, 'cursor-2')),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as RenderedHistory;
}

describe('History timeline diary events', () => {
	test('orders a diary entry among the same day’s runs by when it was written', () => {
		const events = buildHistoryEvents(
			[],
			[
				run('run-late', '2026-09-01T19:00:00.000Z'),
				run('run-early', '2026-09-01T18:00:00.000Z'),
			],
			[],
			[diary('entry-1', 'Between the runs', '2026-09-01T18:30:00.000Z')],
		);

		// The entry's `date` is midnight on the same day as both runs, so ordering on it would sink
		// the entry below everything that happened that day. The mtime places it where it belongs.
		expect(events.map((event) => event.kind)).toEqual(['run', 'diary', 'run']);
		expect(events[1]?.timeValue).toBe(Date.parse('2026-09-01T18:30:00.000Z'));
		expect(events[1]?.timestamp).toBe('2026-09-01T18:30:00.000Z');
	});

	test('exposes diary as a filterable kind with its own count', () => {
		const events = buildHistoryEvents(
			[],
			[run('run-late', '2026-09-01T19:00:00.000Z')],
			[],
			[
				diary('entry-1', 'Between the runs', '2026-09-01T18:30:00.000Z'),
				diary('entry-2', 'The day before', '2026-08-31T17:00:00.000Z'),
			],
		);
		const counts = historyFilterCounts(events);

		expect(HISTORY_FILTERS).toContain('diary');
		expect(counts.diary).toBe(2);
		expect(counts.run).toBe(1);
		expect(counts.all).toBe(3);
		expect(filterHistoryEvents(events, 'diary').map((event) => event.title)).toEqual([
			'Between the runs',
			'The day before',
		]);
		expect(filterHistoryEvents(events, 'run')).toHaveLength(1);
	});

	test('keeps the kind badge free of a status claim', () => {
		// The Diary page's own timeline learned this: coloring a kind badge made a healthy row
		// render amber beside its own green status. Kind is taxonomy, so diary is neutral.
		expect(historyKindLabels.diary).toBe('Diary');
		expect(historyKindTones.diary).toBe('neutral');
	});

	test('leaves the timeline unchanged when a project has no diary entries', () => {
		const runs = [run('run-late', '2026-09-01T19:00:00.000Z')];

		expect(buildHistoryEvents([], runs, [], [])).toEqual(buildHistoryEvents([], runs, []));
	});

	test('renders diary rows linked to the Diary tab, never to Runs', () => {
		const rendered = renderHistory();

		expect(rendered.loaded).toContain('Between the runs');
		expect(rendered.loaded).toContain('?tab=diary');
		expect(rendered.loaded).toContain('What the afternoon was spent on.');
		// The entry's phase is its second badge; the kind badge already says "Diary".
		expect(rendered.loaded).toContain('>Frontend<');
		expect(rendered.loaded.indexOf('Between the runs')).toBeGreaterThan(-1);
	});

	test('distinguishes loading, failure, an empty diary, and more pages', () => {
		const rendered = renderHistory();

		expect(rendered.loading).toContain('Loading diary entries');
		expect(rendered.empty).toContain('No diary entries for this project.');
		expect(rendered.failed).toContain('Diary entries could not be loaded.');
		expect(rendered.failed).toContain('Retry');
		expect(rendered.morePages).toContain('Load more diary entries');
		// Each state is only itself: an empty diary must not read as a failure or a pending load.
		expect(rendered.empty).not.toContain('Loading diary entries');
		expect(rendered.empty).not.toContain('could not be loaded');
		expect(rendered.empty).not.toContain('Load more diary entries');
		expect(rendered.loaded).not.toContain('Load more diary entries');
		expect(rendered.loaded).not.toContain('No diary entries for this project.');
	});

	test('never drops the events it already has while the diary loads or fails', () => {
		const rendered = renderHistory();

		// Features and runs arrive as props, so a diary that is still loading — or one that failed
		// outright — must not blank the rows the tab could already draw.
		for (const html of [rendered.loading, rendered.failed, rendered.empty]) {
			expect(html.match(/<li /gu)).toHaveLength(2);
			expect(html).not.toContain('No dated events recorded for this project yet.');
		}
		expect(rendered.loaded.match(/<li /gu)).toHaveLength(3);
	});
});
