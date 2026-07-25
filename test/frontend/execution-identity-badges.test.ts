import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	executionIdentityItems,
	identityBadgeStyle,
	reasoningBadgeClass,
} from '../../frontend/src/lib/executionIdentity.ts';

function renderExecutionIdentity(props: Record<string, null | string>): string {
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

	test('maps top-effort aliases to fuchsia and unknown values to neutral', () => {
		const scale = {
			none: 'bg-neutral-600',
			minimal: 'bg-slate-600',
			low: 'bg-sky-700',
			medium: 'bg-blue-700',
			high: 'bg-violet-700',
		};
		for (const [value, className] of Object.entries(scale)) {
			expect(reasoningBadgeClass(value)).toContain(className);
		}
		for (const value of ['xhigh', 'ultra', 'max', 'maximum', 'extra-high', 'extra high']) {
			expect(reasoningBadgeClass(value)).toContain('bg-fuchsia-700');
		}
		expect(reasoningBadgeClass('provider-specific')).toContain('bg-neutral-600');
	});

	test('assigns stable value-specific colors to CLIs and models', () => {
		const native = identityBadgeStyle('backend', 'native');
		const codex = identityBadgeStyle('backend', 'codex');
		const glm = identityBadgeStyle('model', 'glm-5.2');
		const gpt = identityBadgeStyle('model', 'gpt-5.6');

		expect(identityBadgeStyle('backend', ' native ')).toEqual(native);
		expect(native.backgroundColor).toBe('hsl(190 68% 42%)');
		expect(glm.backgroundColor).toBe('hsl(220 68% 42%)');
		expect(native.backgroundColor).not.toBe(codex.backgroundColor);
		expect(glm.backgroundColor).not.toBe(gpt.backgroundColor);
		expect(native.backgroundColor).toMatch(/^hsl\(\d{1,3} 68% 42%\)$/);
	});
});

describe('ExecutionIdentityBadges', () => {
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
		expect(html).toContain('lucide-settings');
		expect(html).toContain('overflow-hidden rounded-[3px]');
		expect(html).toContain('border-l border-white/30');
		expect(html).toMatch(/style="background-color:hsl\(\d{1,3} 68% 42%\);color:#[a-f0-9]+"/);
		expect(html).toContain('bg-violet-700');
		expect(html).toContain('max-w-48 truncate');
		expect(html).not.toContain('>openai<');
	});

	test('renders nothing when no identity metadata exists', () => {
		const html = renderExecutionIdentity({});
		expect(html).toBe('');
	});
});
