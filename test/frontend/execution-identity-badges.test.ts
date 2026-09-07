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

function renderExecutionIdentityDetails(props: Record<string, null | string>): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ExecutionIdentityDetails } from './src/components/shared/ExecutionIdentityBadges.tsx';",
		`console.log(renderToStaticMarkup(createElement(ExecutionIdentityDetails, ${JSON.stringify(props)})));`,
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
				model: 'glm-5.3',
				reasoningEffort: 'medium',
			}),
		).toEqual([
			{ kind: 'backend', label: 'native' },
			{ kind: 'model', label: 'glm-5.3' },
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
		expect(html).toContain('focus-visible:ring-ring/80');
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
		// needed 226px in a 219px cell and spilled out of the card instead of truncating the
		// model — the wrapper, not the badge, decided it could not shrink.
		expect(tooltip).toContain("'relative inline-flex max-w-full min-w-0'");
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
			model: 'gpt-5.6-sol',
			provider: 'openai',
			reasoningEffort: 'high',
		});

		expect(html.indexOf('Direct AI')).toBeLessThan(html.indexOf('gpt-5.6-sol'));
		expect(html.indexOf('gpt-5.6-sol')).toBeLessThan(html.indexOf('high'));
		expect(html).toContain(
			'aria-label="CLI Direct AI, Model gpt-5.6-sol, Reasoning high, Provider OpenAI, Resolved Director target"',
		);
		expect(html).toContain('<svg');
		expect(html).toContain('lucide-square-terminal');
		expect(html.match(/max-sm:hidden/g)).toHaveLength(2);
		expect(html).not.toContain('lucide-settings');
		expect(html).toContain('overflow-hidden');
		expect(html).toContain('rounded-md');
		expect(html).toContain('bg-muted');
		expect(html).toContain('ring-border');
		expect(html.match(/border-l border-control-border/g)).toHaveLength(2);
		expect(html).not.toContain('border-l border-border');
		expect(html).toContain('font-medium text-muted-foreground');
		expect(html).toContain('font-semibold text-foreground');
		expect(html).toContain('min-w-0 truncate text-left max-w-48');
		expect(html).not.toContain('[direction:rtl]');
		expect(html).not.toContain('title=');
		expect(html).not.toContain('style=');
		expect(html).not.toContain('hsl(');
		expect(html).not.toMatch(/bg-(?:blue|fuchsia|sky|violet)-700/);
		expect(html).not.toContain('>OpenAI<');
	});

	test('separates human labels from raw identifiers by typeface at both boundaries', () => {
		const badge = renderExecutionIdentity({
			backend: 'direct',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'high',
		});
		const details = renderExecutionIdentityDetails({
			backend: 'direct',
			model: 'gpt-5.6-sol',
			provider: 'openai',
			reasoningEffort: 'high',
		});
		const unknown = renderExecutionIdentityDetails({
			backend: 'custom-cli',
			provider: 'custom-provider',
		});

		expect(badge).toMatch(
			/class="[^"]*font-medium text-muted-foreground[^"]*"[^>]*>[\s\S]*?Direct AI/u,
		);
		expect(badge).toMatch(
			/class="[^"]*font-mono font-semibold[^"]*"[^>]*>[\s\S]*?gpt-5\.6-sol/u,
		);
		expect(details).toContain('<dd class="min-w-0 break-all font-sans">Direct AI</dd>');
		expect(details).toContain('<dd class="min-w-0 break-all font-mono">gpt-5.6-sol</dd>');
		expect(details).toContain('<dd class="min-w-0 break-all font-sans">OpenAI</dd>');
		expect(unknown).toContain('<dd class="min-w-0 break-all font-mono">custom-cli</dd>');
		expect(unknown).toContain('<dd class="min-w-0 break-all font-mono">custom-provider</dd>');
	});

	test('an identity with nothing hidden is still recoverable by touch and keyboard', () => {
		const html = renderExecutionIdentity({
			backend: 'codex',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'high',
		});

		// A badge hiding no provider and no hint still needs a trigger: it hides whatever the layout
		// squeezed out — at 768px the Badge Lab shows `…ode` for `opencode` — and a native `title`
		// as the only way back is mouse-only, not a touch target and not in the tab order.
		expect(html).toContain('tabindex="0"');
		expect(html).toContain('max-sm:before:-inset-2.5');
		expect(html).not.toContain('max-sm:min-h-11');
		expect(html).not.toContain('title=');
	});

	test('segments preserve variable identity before constant chrome', () => {
		const html = renderExecutionIdentity({
			backend: 'opencode',
			model: 'organization/research-preview-model-with-an-intentionally-long-name',
			reasoningEffort: 'provider-specific',
		});
		const compactHtml = renderExecutionIdentity({
			backend: 'opencode',
			compactReasoningLabel: true,
			model: 'organization/research-preview-model-with-an-intentionally-long-name',
			reasoningEffort: 'provider-specific',
			variant: 'compact',
		});

		// The bounded CLI keeps its complete name. Custom reasoning values yield first without a
		// floor that can steal the model's remaining space, and ordinary tail truncation keeps each
		// identifying prefix. Compact multi-field badges omit constant glyphs before variable text.
		// Only the raw model and reasoning identifiers carry the machine-value type ladder; the
		// humanized CLI product label remains sans.
		const segments = html.match(/<span class="[^"]*font-mono[^"]*"/g) ?? [];
		expect(segments).toHaveLength(2);
		expect(segments.filter((segment) => segment.includes('shrink-0'))).toHaveLength(0);
		expect(segments.filter((segment) => segment.includes('min-w-[4.5rem]'))).toHaveLength(1);
		expect(segments.filter((segment) => segment.includes('min-w-16'))).toHaveLength(0);
		expect(segments.filter((segment) => segment.includes('max-w-32'))).toHaveLength(1);
		expect(segments.filter((segment) => segment.includes('shrink-[2]'))).toHaveLength(1);
		expect(compactHtml).toContain('OpenCode');
		expect(compactHtml).toContain(
			'organization/research-preview-model-with-an-intentionally-long-name',
		);
		expect(compactHtml).toContain('provider-specific');
		expect(compactHtml).toContain('shrink-0');
		expect(compactHtml).toContain('flex-auto');
		expect(compactHtml.match(/flex-auto/gu)).toHaveLength(2);
		expect(compactHtml).not.toContain('px-1.5');
		expect(compactHtml).not.toContain('lucide-square-terminal');
		expect(compactHtml).not.toContain('lucide-gauge');
		// And the badge still cannot push its own container wider than the column it was given.
		expect(html).toContain('max-w-full');
		expect(html).toContain('overflow-hidden');
	});

	test('keeps hidden provider and hint details available in a tooltip', () => {
		const html = renderExecutionIdentity({
			backend: 'native',
			hint: 'Resolved project target',
			model: 'glm-5.3',
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
		expect(html).not.toContain('max-sm:-m-2.5');
		expect(html).not.toContain('max-sm:p-2.5');
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
		expect(html).toContain('Codex');
		expect(html).toContain('gpt-5.6-sol');
		expect(html).toContain('Claude Code');
		expect(html).toContain('claude-fable-5');
	});
});
