import { afterEach, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
			backend: 'codex',
			executionIntent: 'review-only',
			model: 'gpt-6-astra',
			projectDir: 'D:\\applications\\aidd',
			prompt: 'Inspect the current implementation.',
			reasoningEffort: 'high',
		});

		expect(run.id).toBe('run_directive_1');
		expect(capturedPath).toBe('/api/v1/runs/directive');
		expect(capturedMethod).toBe('POST');
		expect(capturedBody).toEqual({
			backend: 'codex',
			executionIntent: 'review-only',
			model: 'gpt-6-astra',
			projectDir: 'D:\\applications\\aidd',
			prompt: 'Inspect the current implementation.',
			reasoningEffort: 'high',
		});
	});

	test('renders an editable directive-mode launch target and submits its state', async () => {
		// The control and the defaults query that explains it sit in the launcher's target field;
		// the modal keeps only what it submits. Asserting the pair keeps the property — an editable
		// directive target whose state reaches the request — stated where each half of it lives.
		const source = async (name: string): Promise<string> =>
			readFile(join(process.cwd(), 'frontend', 'src', 'components', 'shared', name), 'utf8');
		const [modal, target] = await Promise.all([
			source('DirectiveLaunchModal.tsx'),
			source('DirectiveTargetField.tsx'),
		]);

		expect(target).toContain('<LaunchTargetControl');
		expect(target).toContain('mode="directive"');
		expect(target).toContain('size="default"');
		expect(modal).toContain('<DirectiveTargetField');
		expect(modal).toContain(
			'{ executionIntent, ...launchTarget, projectDir, prompt: directive }',
		);
		expect(modal).not.toContain('<LaunchTargetBadge');
		expect(target).not.toContain('<LaunchTargetBadge');
	});

	test('surfaces the process-argument persistence boundary to operators', () => {
		expect(DIRECTIVE_PROMPT_SAFETY_NOTICE).toContain('Do not include secrets');
		expect(DIRECTIVE_PROMPT_SAFETY_NOTICE).toContain('run history');
		expect(DIRECTIVE_PROMPT_SAFETY_NOTICE).toContain('process arguments');
	});

	test('renders the persistence warning as its own hint row beside the shortcut tip', async () => {
		// LOC-7: adjacent inline spans with no whitespace between them rendered the Directive
		// hint as "launch.Do not include secrets" at every size. The warning is the dialog's
		// disclosure that directive text persists in run history and process arguments, so it
		// owns a row on the field hint's gap-1 rhythm instead of clinging to the shortcut
		// sentence; the shortcut sentence keeps the muted hint tone.
		const modal = await readFile(
			join(
				process.cwd(),
				'frontend',
				'src',
				'components',
				'shared',
				'DirectiveLaunchModal.tsx',
			),
			'utf8',
		);
		const start = modal.indexOf('error={promptError}');
		const end = modal.indexOf('label="Directive"', start);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const hint = modal
			.slice(start, end)
			.replaceAll(/\/\*[\s\S]*?\*\//g, '')
			.replaceAll(/\/\/[^\n]*/g, '');
		// The grid wrapper is the whole fix: it makes each span its own row on the field hint's
		// gap-1 rhythm. Reverting to a bare fragment keeps the spans adjacent and inline, which
		// is the run-on "launch.Do not include secrets" the sweep measured. The regex pins the
		// wrapper as the hint's only child, the shortcut row first, and the notice inside the
		// amber row.
		expect(hint).toMatch(
			/hint=\{\s*<span className="grid gap-1">\s*<span>Press Ctrl\+Enter or Cmd\+Enter to launch\.<\/span>\s*<span className=\{toneText\.amber\}>\s*\{DIRECTIVE_PROMPT_SAFETY_NOTICE\}\s*<\/span>\s*<\/span>\s*\}/u,
		);
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
