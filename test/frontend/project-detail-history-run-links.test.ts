import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderHistory(): string {
	const script = String.raw`
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { HistoryTab } from './src/pages/projects/detail/HistoryTab.tsx';

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
	endedAt: '2026-09-01T18:01:00.000Z',
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
	startedAt: '2026-09-01T18:00:00.000Z',
	stopReason: 'completed',
	summary: 'Completed one feature.',
	triumvirateRoles: null,
	unattributedDirtySourceFiles: [],
};
const managedRunId = 'run_1788285600000_1a2b3c4d';
const cliRunId = '23241b43-9a00-40c1-896f-da8662e8a7fe';
const localRuns = [
	{ ...baseRun, runId: managedRunId, source: 'web' },
	{
		...baseRun,
		endedAt: '2026-09-01T17:01:00.000Z',
		runId: cliRunId,
		source: 'cli',
		startedAt: '2026-09-01T17:00:00.000Z',
	},
];
const view = createElement(HistoryTab, {
	features: [],
	localIterations: [],
	localRuns,
	projectId: 'aidd',
	projectPath: 'D:\\applications\\aidd',
});
// The tab reads this project's diary itself, so the render needs a client. Seeding an empty
// page keeps this test about run links: no diary rows, and no pending state to wait on.
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
client.setQueryData(['diary', 'entries', 'D:\applications\aidd'], {
	pageParams: [undefined],
	pages: [{ entries: [], nextCursor: null }],
});
console.log(JSON.stringify({
	cliRunId,
	html: renderToStaticMarkup(
		createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, view)),
	),
	managedRunId,
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('Project Detail History Run links', () => {
	test('keeps CLI and web Runs in one timeline without linking CLI-only ids', () => {
		const rendered = JSON.parse(renderHistory()) as {
			cliRunId: string;
			html: string;
			managedRunId: string;
		};

		expect(rendered.html.match(/<li /gu)).toHaveLength(2);
		expect(rendered.html).toContain(
			`href="/runs?project=D%3A%5Capplications%5Caidd&amp;run=${rendered.managedRunId}"`,
		);
		expect(rendered.html).not.toContain(`run=${rendered.cliRunId}`);
		expect(rendered.html).toContain('Web launch');
		expect(rendered.html).toContain('CLI launch');
		expect(rendered.html.match(/Coding run completed/gu)).toHaveLength(2);
	});
});
