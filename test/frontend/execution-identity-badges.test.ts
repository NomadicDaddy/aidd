import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { executionIdentityItems } from '../../frontend/src/lib/executionIdentity.ts';

function renderExecutionIdentity(props: Record<string, boolean | null | string>): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ExecutionIdentityBadges } from './src/components/shared/ExecutionIdentityBadges.tsx';",
		`console.log(renderToStaticMarkup(createElement(ExecutionIdentityBadges, ${JSON.stringify(props)})));`,
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

function renderPipelineIdentities(identities: Record<string, null | string>[]): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { PipelineSessionIdentityBadges } from './src/pages/runs/PipelineSessionIdentityBadges.tsx';",
		`console.log(renderToStaticMarkup(createElement(PipelineSessionIdentityBadges, { identities: ${JSON.stringify(identities)} })));`,
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

describe('execution identity badge data', () => {
	test('orders raw CLI, model, and reasoning identifiers', () => {
		expect(
			executionIdentityItems({
				backend: 'claude-code',
				model: 'claude-fable-5',
				reasoningEffort: 'high',
			}),
		).toEqual([
			{ kind: 'backend', label: 'claude-code' },
			{ kind: 'model', label: 'claude-fable-5' },
			{ kind: 'reasoning', label: 'high' },
		]);
		expect(
			executionIdentityItems({
				backend: 'native',
				model: 'glm-5.2',
				reasoningEffort: 'medium',
			}),
		).toEqual([
			{ kind: 'backend', label: 'native' },
			{ kind: 'model', label: 'glm-5.2' },
			{ kind: 'reasoning', label: 'medium' },
		]);
	});

	test('omits missing values and trims recorded identifiers', () => {
		expect(
			executionIdentityItems({ backend: ' native ', model: ' ', reasoningEffort: null }),
		).toEqual([{ kind: 'backend', label: 'native' }]);
	});
});

describe('ExecutionIdentityBadges', () => {
	test('truncation measurement never re-renders the measured span', () => {
		const source = readFileSync(
			resolve(
				import.meta.dir,
				'../../frontend/src/components/shared/ExecutionIdentityBadges.tsx',
			),
			'utf8',
		);
		const start = source.indexOf('function OverflowIdentityValue');
		const end = source.indexOf('export function ExecutionIdentityDetails');
		expect(start).toBeGreaterThan(-1);
		const overflowValue = source.slice(start, end);

		expect(overflowValue).toContain('element.scrollWidth > element.clientWidth');
		// Re-rendering on the measurement reparents the span into Tooltip's `relative inline-flex`
		// wrapper, which changes clientWidth, which flips the measurement back — React #185.
		expect(overflowValue).not.toContain('useState');
		expect(overflowValue).not.toContain('<Tooltip');
	});

	test('renders the requested direct identity at the component boundary', () => {
		const html = renderExecutionIdentity({
			backend: 'direct',
			hint: 'Resolved Director target',
			model: 'gpt-5.6',
			provider: 'openai',
			reasoningEffort: 'high',
		});

		expect(html.indexOf('direct')).toBeLessThan(html.indexOf('gpt-5.6'));
		expect(html.indexOf('gpt-5.6')).toBeLessThan(html.indexOf('high'));
		expect(html).toContain(
			'aria-label="CLI direct, Model gpt-5.6, Reasoning high, Provider openai, Resolved Director target"',
		);
		expect(html).toContain('<svg');
		expect(html).toContain('lucide-square-terminal');
		expect(html).not.toContain('lucide-settings');
		expect(html).toContain('overflow-hidden rounded-[3px]');
		expect(html).toContain('bg-muted');
		expect(html).toContain('ring-border');
		expect(html).toContain('border-l border-border');
		expect(html).toContain('font-medium text-muted-foreground');
		expect(html).toContain('font-semibold text-foreground');
		expect(html).toContain('max-w-48 truncate');
		expect(html).not.toContain('title=');
		expect(html).not.toContain('style=');
		expect(html).not.toContain('hsl(');
		expect(html).not.toMatch(/bg-(?:blue|fuchsia|sky|violet)-700/);
		expect(html).not.toContain('>openai<');
	});

	test('does not make a fully visible identity an interactive tooltip trigger', () => {
		const html = renderExecutionIdentity({
			backend: 'codex',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'high',
		});

		expect(html).not.toContain('title=');
		expect(html).not.toContain('tabindex=');
	});

	test('keeps hidden provider and hint details available in a tooltip', () => {
		const html = renderExecutionIdentity({
			backend: 'native',
			hint: 'Resolved project target',
			model: 'glm-5.2',
			provider: 'zhipu',
			reasoningEffort: 'medium',
		});

		expect(html).toContain('tabindex="0"');
		expect(html).not.toContain('title=');
	});

	test('respects the explicit no-tooltip variant', () => {
		const html = renderExecutionIdentity({
			backend: 'codex',
			model: 'gpt-5.6-sol',
			withTooltip: false,
		});

		expect(html).not.toContain('title=');
		expect(html).not.toContain('tabindex=');
	});

	test('renders nothing when no identity metadata exists', () => {
		const html = renderExecutionIdentity({});
		expect(html).toBe('');
	});
});

describe('PipelineSessionIdentityBadges', () => {
	test('renders an em dash when no child run has an execution identity', () => {
		expect(renderPipelineIdentities([])).toContain('>—</span>');
	});

	test('renders each distinct pipeline runtime with mixed-runtime context', () => {
		const html = renderPipelineIdentities([
			{
				backend: 'codex',
				model: 'gpt-5.6-sol',
				provider: null,
				reasoningEffort: 'high',
			},
			{
				backend: 'claude-code',
				model: 'claude-fable-5',
				provider: null,
				reasoningEffort: 'xhigh',
			},
		]);

		expect(html).toContain('Pipeline runtime 1 of 2');
		expect(html).toContain('Pipeline runtime 2 of 2');
		expect(html).toContain('codex');
		expect(html).toContain('gpt-5.6-sol');
		expect(html).toContain('claude-code');
		expect(html).toContain('claude-fable-5');
	});
});
