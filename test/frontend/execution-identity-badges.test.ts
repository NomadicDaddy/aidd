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
	test('uses the canonical Badge radius, type, and focus ladders', () => {
		const source = readFileSync(
			resolve(
				import.meta.dir,
				'../../frontend/src/components/shared/ExecutionIdentityBadges.tsx',
			),
			'utf8',
		);
		const html = renderExecutionIdentity({
			backend: 'opencode',
			model: 'organization/repository-long-model-name',
			reasoningEffort: 'xhigh',
		});

		expect(source).toContain("import { Badge } from '../ui/badge.tsx';");
		expect(source).toContain('<Badge');
		expect(source).not.toContain('rounded-[3px]');
		expect(source).not.toContain('text-[11px]');
		expect(html).toContain('rounded-md');
		expect(html).toContain('text-xs');
		expect(html).toContain('focus-visible:ring-2');
		expect(html).toContain('focus-visible:ring-ring/50');
		expect(html).toContain('focus-visible:ring-offset-2');
		expect(html).toContain('focus-visible:[--tw-ring-inset:initial]');
		expect(html.match(/class="[^"]*min-w-0[^"]*truncate[^"]*"/g)).toHaveLength(3);
	});

	test('the tooltip wrapper does not revoke the shrinking the badge asks for', () => {
		const html = renderExecutionIdentity({
			backend: 'codex',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'high',
		});
		const tooltip = readFileSync(
			resolve(import.meta.dir, '../../frontend/src/components/ui/tooltip.tsx'),
			'utf8',
		);

		// The badge declares `max-w-full min-w-0`, but that resolves against whatever box encloses
		// it. Tooltip's wrapper was a rigid `relative inline-flex`, so on Project Detail the badge
		// needed 226px in a 219px cell and spilled out of the card instead of head-truncating the
		// model — the wrapper, not the badge, decided it could not shrink.
		expect(tooltip).toContain('<span className="relative inline-flex max-w-full min-w-0"');
		expect(html).toContain('class="relative inline-flex max-w-full min-w-0"');
		expect(html).toContain('max-w-full min-w-0 items-stretch');
	});

	test('nothing about the badge is decided by measuring the badge', () => {
		const source = readFileSync(
			resolve(
				import.meta.dir,
				'../../frontend/src/components/shared/ExecutionIdentityBadges.tsx',
			),
			'utf8',
		);

		// Reveal-on-clip is what took the Runs page down with React #185: the measurement decided
		// whether to wrap the measured span in Tooltip's `relative inline-flex`, which changed its
		// clientWidth, which flipped the measurement back. The recovery route is unconditional now,
		// so there is no measurement left to feed back — and no way to reintroduce the loop without
		// reintroducing one of these.
		expect(source).not.toContain('scrollWidth');
		expect(source).not.toContain('ResizeObserver');
		expect(source).not.toContain('useState');
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
		expect(html).toContain('overflow-hidden');
		expect(html).toContain('rounded-md');
		expect(html).toContain('bg-muted');
		expect(html).toContain('ring-border');
		expect(html).toContain('border-l border-border');
		expect(html).toContain('font-medium text-muted-foreground');
		expect(html).toContain('font-semibold text-foreground');
		expect(html).toContain('min-w-0 truncate text-left [direction:rtl] max-w-48');
		expect(html).not.toContain('title=');
		expect(html).not.toContain('style=');
		expect(html).not.toContain('hsl(');
		expect(html).not.toMatch(/bg-(?:blue|fuchsia|sky|violet)-700/);
		expect(html).not.toContain('>openai<');
	});

	test('an identity with nothing hidden is still recoverable by touch and keyboard', () => {
		const html = renderExecutionIdentity({
			backend: 'codex',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'high',
		});

		// This used to render no trigger at all, on the theory that a badge hiding no provider and
		// no hint has nothing to reveal. It hides whatever the layout squeezed out: at 768px the
		// Badge Lab showed `…ode` for `opencode`. A native `title` was the only way back, and a
		// native title is mouse-only — not a touch target and not in the tab order.
		expect(html).toContain('tabindex="0"');
		expect(html).not.toContain('title=');
	});

	test('the segment that shrinks is the one whose truncation still names something', () => {
		const html = renderExecutionIdentity({
			backend: 'opencode',
			model: 'organization/research-preview-model-with-an-intentionally-long-name',
			reasoningEffort: 'provider-specific',
		});

		// Flex shrink is proportional, so a squeezed badge used to take characters off all three
		// segments at once and `opencode` became `…ode` — a backend that names no backend. The
		// short bounded vocabularies hold their width; the model absorbs the squeeze, because it
		// is the one that loses characters off the head and keeps the discriminating tail.
		// The three segment wrappers are the only spans carrying the machine-value type ladder.
		const segments = html.match(/<span class="[^"]*font-mono[^"]*"/g) ?? [];
		expect(segments).toHaveLength(3);
		expect(segments.filter((segment) => segment.includes('shrink-0'))).toHaveLength(2);
		expect(segments.filter((segment) => segment.includes('min-w-[4.5rem]'))).toHaveLength(1);
		// And the badge still cannot push its own container wider than the column it was given.
		expect(html).toContain('max-w-full');
		expect(html).toContain('overflow-hidden');
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
