import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderHistoryPanel(totalRunCount: number, visibleRunCount: number): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalAiddHistoryPanel } from './src/components/shared/LocalAiddHistoryPanel.tsx';
import { PageRail } from './src/components/shared/PageRail.tsx';

const runs = Array.from({ length: ${visibleRunCount} }, (_, index) => ({
	aiddDirty: false,
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
	endedAt: new Date(Date.UTC(2026, 0, index + 1, 0, 1)).toISOString(),
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
	runId: 'run-' + index,
	runLedgerDirty: false,
	scopeOverrun: false,
	source: 'cli',
	startedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
	stopReason: null,
	summary: 'Completed run ' + index,
	triumvirateRoles: null,
	unattributedDirtySourceFiles: [],
}));

console.log(renderToStaticMarkup(createElement(
	PageRail,
	{ rail: 'data' },
	createElement(LocalAiddHistoryPanel, {
		description: 'Recorded ledger rows.',
		iterations: [],
		runs,
		title: 'Local runs',
		totalRunCount: ${totalRunCount},
	}),
)));
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

describe('project Runs ledger cap', () => {
	test('renders the capped row population against the full ledger total', () => {
		const html = renderHistoryPanel(906, 20);

		expect(html).toContain('20 shown · 906 total');
		expect(html).not.toContain('all time');
	});

	test('labels an uncapped population as the full ledger', () => {
		const html = renderHistoryPanel(2, 2);

		expect(html).toContain('2 shown · 2 total');
	});
});
