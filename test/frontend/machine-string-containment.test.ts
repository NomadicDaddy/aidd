import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const FRONTEND_ROOT = join(ROOT, 'frontend');

interface RenderedSurfaces {
	command: string;
	invocations: string;
	leaderboard: string;
	notFound: string;
}

function renderSurfaces(): RenderedSurfaces {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { NotFoundPage } from './src/pages/notFound/NotFoundPage.tsx';
import { RunCommandBlock } from './src/pages/runs/runDetailParts.tsx';
import { InvocationsTable } from './src/pages/telemetry/InvocationsTable.tsx';
import { LeaderboardCard } from './src/pages/telemetry/LeaderboardCard.tsx';

const resourceName = 'AGENT_TOOL_SANDBOX+' + 'ARCHITECTURE+'.repeat(42);
const resourceId = 'audit-' + 'unbroken-key-'.repeat(42);
const pathname = '/' + 'unbroken-path-segment'.repeat(7);
const command = 'bun run start -- --project-dir D:\\applications\\' + 'unbroken-folder'.repeat(12);

const row = {
	avgDurationMs: 1000,
	completed: 1,
	failed: 0,
	flagged: 0,
	killed: 0,
	lastUsedAt: 1700000000000,
	nested: 0,
	noWork: 0,
	resourceId,
	resourceName,
	resourceType: 'skill',
	running: 0,
	stopped: 0,
	topLevel: 1,
	total: 1,
	warnings: 0,
};

const invocation = {
	argsPresent: false,
	backend: null,
	completedAt: 1700000001000,
	durationMs: 1000,
	errorMessage: null,
	exitCode: 0,
	id: 'invocation-long-machine-string',
	model: null,
	parentInvocationId: null,
	parentResourceId: null,
	parentResourceName: null,
	parentResourceType: null,
	projectName: 'D:\\applications\\' + 'long-project-name'.repeat(20),
	projectPath: 'D:\\applications\\demo',
	resourceId,
	resourceName,
	resourceType: 'skill',
	runExitCode: null,
	runId: null,
	runStatus: null,
	runStopReason: null,
	runSummary: null,
	sessionId: null,
	source: 'web',
	startedAt: 1700000000000,
	status: 'completed',
};

function render(element) {
	return renderToStaticMarkup(createElement(MemoryRouter, null, element));
}

console.log(JSON.stringify({
	command: render(createElement(RunCommandBlock, {
		command: { args: [], display: command, source: 'exact' },
		runId: 'run-machine-string',
	})),
	invocations: render(createElement(InvocationsTable, { invocations: [invocation] })),
	leaderboard: render(createElement(LeaderboardCard, { rows: [row] })),
	notFound: renderToStaticMarkup(createElement(
		MemoryRouter,
		{ initialEntries: [pathname] },
		createElement(NotFoundPage),
	)),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as RenderedSurfaces;
}

const rendered = renderSurfaces();

describe('machine strings stay inside the surface that owns them', () => {
	test('the shared primitives declare the two containment policies', async () => {
		const typography = await readFile(
			join(FRONTEND_ROOT, 'src', 'lib', 'typography.ts'),
			'utf8',
		);

		expect(typography).toContain(
			"export const machineLabelClass = 'block max-w-full min-w-0 truncate'",
		);
		expect(typography).toContain(
			"export const machineTextBreakClass = 'break-words [overflow-wrap:anywhere]'",
		);
		expect(typography).toContain('Callers that shorten the value must put its full text');
		expect(typography).toContain('character-level breaking keeps every character inside');
	});

	test('long telemetry labels render bounded with their full values recoverable', () => {
		for (const markup of [rendered.leaderboard, rendered.invocations]) {
			expect(markup).toContain('block max-w-full min-w-0 truncate');
			expect(markup).toContain('title="AGENT_TOOL_SANDBOX+ARCHITECTURE+');
		}
		expect(rendered.leaderboard).toContain('grid-cols-[minmax(0,1fr)]');
		expect(rendered.invocations).toContain('min-w-[64rem] table-fixed');
	});

	test('long paths and commands prefer boundaries before breaking unbroken tokens', () => {
		expect(rendered.notFound).toContain('break-words [overflow-wrap:anywhere]');
		expect(rendered.notFound).toContain('unbroken-path-segment'.repeat(7));
		expect(rendered.command).toContain('break-words [overflow-wrap:anywhere]');
		expect(rendered.command).toContain('unbroken-folder'.repeat(12));
	});
});
