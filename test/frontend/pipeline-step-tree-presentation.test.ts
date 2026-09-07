import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderRows(): string[] {
	const step = {
		completedAt: 2_000,
		depth: 0,
		displayOrder: 1,
		durationMs: 1_000,
		errorMessage: null,
		executionIdentity: null,
		exitCode: 0,
		id: 'step-result',
		outputSummary: null,
		parentStepResultId: null,
		phase: 'step',
		runId: null,
		sequenceNumber: 1,
		sessionId: 'pipeline-session',
		startedAt: 1_000,
		status: 'completed',
		stepDefinitionId: null,
		stepName: 'Rendered step',
		stepType: 'skill',
	};
	const script = [
		"import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
		"import { createElement as h } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { ExecutedStepRow } from './src/pages/pipelineSessions/StepRows.tsx';",
		`const step = ${JSON.stringify(step)};`,
		'const client = new QueryClient();',
		'const render = (depth, parentStepName, suppressTiming = false, suppressName = false) => renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, null, h(ExecutedStepRow, { now: 2000, parentStepName, sessionErrorMessage: null, step: { ...step, depth }, suppressName, suppressTiming, totalSteps: 3 }))));',
		"console.log(JSON.stringify([render(0, null), render(1, 'Top-level step'), render(2, 'Nested step'), render(0, null, true), render(0, null, true, true)]));",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as string[];
}

describe('pipeline step tree presentation', () => {
	test('renders containment, elevation, and heading rank from actual depth', () => {
		const [topLevel = '', child = '', grandchild = ''] = renderRows();

		// Semantic heading rank descends with the tree while the visual title rank remains stable.
		expect(topLevel).toContain('<h3 class="min-w-0 text-base font-semibold text-foreground"');
		expect(topLevel).toContain('shadow-[0_12px_32px_rgba(0,0,0,0.06)]');
		expect(topLevel).not.toContain('Child of');

		expect(child).toContain('sm:mx-6');
		expect(child).toContain('Child of Top-level step');
		expect(child).toContain('<h4 class="min-w-0 text-base font-semibold text-foreground"');
		expect(child).toContain('border-border bg-card shadow-sm');

		expect(grandchild).toContain('sm:mx-12');
		expect(grandchild).toContain('Child of Nested step');
		expect(grandchild).toContain('<h5 class="min-w-0 text-base font-semibold text-foreground"');
		expect(grandchild).toContain('bg-muted/90 shadow-inner');
		expect(grandchild).not.toContain('style=');
	});

	test('hiding repeated timing preserves a distinct step name; only duplicate names yield', () => {
		const [, , , distinct = '', duplicate = ''] = renderRows();
		expect(distinct).toContain('>Rendered step</h3>');
		expect(distinct).not.toContain('>Run detail</h3>');
		expect(duplicate).toContain('>Run detail</h3>');
		expect(duplicate).not.toContain('>Rendered step</h3>');
	});
});
