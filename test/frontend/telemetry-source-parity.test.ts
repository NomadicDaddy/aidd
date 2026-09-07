import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type {
	InvocationRecord,
	TelemetryInvocationSource,
} from '../../frontend/src/api/types/telemetry.ts';

import { invocationSourceLabel } from '../../frontend/src/pages/telemetry/invocationSource.ts';

const sources = [
	'cli',
	'recipe-step',
	'scheduled',
	'web',
] as const satisfies readonly TelemetryInvocationSource[];

function invocation(source: TelemetryInvocationSource): InvocationRecord {
	return {
		argsPresent: false,
		backend: null,
		completedAt: 1_700_000_001_000,
		durationMs: 1_000,
		errorMessage: null,
		exitCode: 0,
		id: `invocation-${source}`,
		model: null,
		parentInvocationId: null,
		parentResourceId: null,
		parentResourceName: null,
		parentResourceType: null,
		projectName: 'aidd',
		projectPath: 'D:/applications/aidd',
		resourceId: `skill-${source}`,
		resourceName: `${invocationSourceLabel(source)} skill`,
		resourceSha256: null,
		resourceType: 'skill',
		runExitCode: null,
		runId: null,
		runStatus: null,
		runStopReason: null,
		runSummary: null,
		sessionId: null,
		source,
		startedAt: 1_700_000_000_000,
		status: 'completed',
	};
}

function renderTelemetrySources(): string {
	const invocations = sources.map(invocation);
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
		"import { MemoryRouter } from 'react-router';",
		"import { InvocationDetailsPanel } from './src/pages/telemetry/InvocationDetails.tsx';",
		"import { InvocationsTable } from './src/pages/telemetry/InvocationsTable.tsx';",
		`const invocations = ${JSON.stringify(invocations)};`,
		'const table = createElement(InvocationsTable, { invocations });',
		'const details = createElement(QueryClientProvider, { client: new QueryClient() }, createElement(InvocationDetailsPanel, { invocation: invocations[2] }));',
		"console.log(renderToStaticMarkup(createElement(MemoryRouter, null, createElement('div', null, table, details))));",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('telemetry invocation source parity', () => {
	test('keeps one exhaustive human-readable label for every source', () => {
		expect(sources.map(invocationSourceLabel)).toEqual([
			'CLI',
			'Recipe step',
			'Scheduled',
			'Web',
		]);
	});

	test('renders scheduled sources canonically in the table, card, and details panel', () => {
		const html = renderTelemetrySources();

		for (const label of ['CLI', 'Recipe step', 'Web']) {
			expect(html.match(new RegExp(`>${label}<`, 'g'))).toHaveLength(2);
		}
		expect(html.match(/>Scheduled</g)).toHaveLength(3);
		expect(html).toContain(
			'>Source</dt><dd class="mt-0.5 text-xs break-all text-foreground">Scheduled</dd>',
		);
		expect(html).not.toMatch(/>(?:cli|recipe-step|scheduled|web)</);
	});
});
