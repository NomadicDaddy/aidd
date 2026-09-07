import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderInvocationsTable(): string {
	const invocation = {
		argsPresent: true,
		backend: 'native',
		completedAt: 1_700_000_001_000,
		durationMs: 1_000,
		errorMessage: 'provider unavailable',
		exitCode: 7,
		id: 'invocation-1',
		model: 'glm-5.3',
		parentInvocationId: 'invocation-parent',
		parentResourceId: 'recipe-parent',
		parentResourceName: 'Parent recipe',
		parentResourceType: 'recipe',
		projectName: 'aidd',
		projectPath: 'D:/applications/aidd',
		resourceId: 'skill-1',
		resourceName: 'Review skill',
		resourceType: 'skill',
		runExitCode: 7,
		runId: 'run-1',
		runStatus: 'failed',
		runStopReason: 'exit_error',
		runSummary: 'provider failed',
		sessionId: 'session-1',
		source: 'cli',
		startedAt: 1_700_000_000_000,
		status: 'completed',
	};
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
		"import { MemoryRouter } from 'react-router';",
		"import { InvocationDetailsPanel } from './src/pages/telemetry/InvocationDetails.tsx';",
		"import { InvocationsTable } from './src/pages/telemetry/InvocationsTable.tsx';",
		`const invocation = ${JSON.stringify(invocation)};`,
		'const table = createElement(InvocationsTable, { invocations: [invocation] });',
		'const detail = createElement(QueryClientProvider, { client: new QueryClient() }, createElement(InvocationDetailsPanel, { invocation }));',
		"const surfaces = createElement('div', null, table, detail);",
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, surfaces)));',
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

describe('Telemetry invocation identity', () => {
	test('renders resource type separately from CLI and model badges', () => {
		const html = renderInvocationsTable();

		expect(html).toContain('aria-label="Recent invocations"');
		expect(html).toContain('aria-label="CLI Native, Model glm-5.3"');
		expect(html.indexOf('skill')).toBeLessThan(html.indexOf('CLI Native'));
		expect(html).not.toContain('skill · native');
		expect(html).toContain('Inspect');
		expect(html).toContain('Arguments supplied');
		expect(html).toContain('values are not stored');
		expect(html).toContain('D:/applications/aidd');
		expect(html).toContain('provider unavailable');
		expect(html).toContain('run-1');
		expect(html).toContain('session-1');
	});
});
