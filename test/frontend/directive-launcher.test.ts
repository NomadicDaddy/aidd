import { afterEach, describe, expect, test } from 'bun:test';

import { launchDirectiveRun } from '../../frontend/src/api/runs.ts';
import {
	canLaunchDirective,
	DIRECTIVE_PROMPT_SAFETY_NOTICE,
	isDirectiveSubmitShortcut,
} from '../../frontend/src/components/shared/directive-launch-policy.ts';
import { shouldSuppressGlobalShortcut } from '../../frontend/src/hooks/useKeyboardShortcuts.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('global directive launcher API', () => {
	test('posts the explicit project, prompt, and execution intent to the directive endpoint', async () => {
		let capturedBody: unknown;
		let capturedMethod: string | undefined;
		let capturedPath = '';
		globalThis.fetch = (async (input, init) => {
			capturedPath = String(input);
			capturedMethod = init?.method;
			capturedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
			return new Response(JSON.stringify({ run: { id: 'run_directive_1' } }), {
				headers: { 'content-type': 'application/json' },
				status: 200,
			});
		}) as typeof fetch;

		const run = await launchDirectiveRun({
			executionIntent: 'review-only',
			projectDir: 'D:\\applications\\aidd',
			prompt: 'Inspect the current implementation.',
		});

		expect(run.id).toBe('run_directive_1');
		expect(capturedPath).toBe('/api/v1/runs/directive');
		expect(capturedMethod).toBe('POST');
		expect(capturedBody).toEqual({
			executionIntent: 'review-only',
			projectDir: 'D:\\applications\\aidd',
			prompt: 'Inspect the current implementation.',
		});
	});

	test('surfaces the process-argument persistence boundary to operators', () => {
		expect(DIRECTIVE_PROMPT_SAFETY_NOTICE).toContain('Do not include secrets');
		expect(DIRECTIVE_PROMPT_SAFETY_NOTICE).toContain('run history');
		expect(DIRECTIVE_PROMPT_SAFETY_NOTICE).toContain('process arguments');
	});
});

describe('directive launcher form policy', () => {
	test('requires a project and non-blank prompt while no launch is pending', () => {
		expect(
			canLaunchDirective({
				isPending: false,
				projectDir: 'D:\\applications\\aidd',
				prompt: 'Inspect this change.',
			}),
		).toBe(true);
		expect(
			canLaunchDirective({
				isPending: false,
				projectDir: '',
				prompt: 'Inspect this change.',
			}),
		).toBe(false);
		expect(
			canLaunchDirective({
				isPending: false,
				projectDir: 'D:\\applications\\aidd',
				prompt: '   ',
			}),
		).toBe(false);
		expect(
			canLaunchDirective({
				isPending: true,
				projectDir: 'D:\\applications\\aidd',
				prompt: 'Inspect this change.',
			}),
		).toBe(false);
	});

	test('submits only Ctrl+Enter or Cmd+Enter', () => {
		expect(isDirectiveSubmitShortcut({ ctrlKey: true, key: 'Enter', metaKey: false })).toBe(
			true,
		);
		expect(isDirectiveSubmitShortcut({ ctrlKey: false, key: 'Enter', metaKey: true })).toBe(
			true,
		);
		expect(isDirectiveSubmitShortcut({ ctrlKey: false, key: 'Enter', metaKey: false })).toBe(
			false,
		);
		expect(isDirectiveSubmitShortcut({ ctrlKey: true, key: 'd', metaKey: false })).toBe(false);
	});
});

describe('global shortcut suppression policy', () => {
	test('suppresses global shortcuts while typing or while a modal is open', () => {
		expect(shouldSuppressGlobalShortcut(true, false)).toBe(true);
		expect(shouldSuppressGlobalShortcut(false, true)).toBe(true);
		expect(shouldSuppressGlobalShortcut(true, true)).toBe(true);
		expect(shouldSuppressGlobalShortcut(false, false)).toBe(false);
	});
});
