import type { BackendName } from '../plan/types.ts';
import type { PromptInput } from './types.ts';

import { normalizeReasoningEffort } from '../args/constants.ts';

export interface BackendCommand {
	args: string[];
	command: string;
	env?: Record<string, string>;
}

const SAFE_BACKEND_ARG = /^[A-Za-z0-9._:/@-]+$/;

function assertSafeBackendArg(label: string, value: string): void {
	if (!SAFE_BACKEND_ARG.test(value)) {
		throw new Error(
			`Unsafe ${label} value: "${value}" contains characters outside the allowed set [A-Za-z0-9._:/@-]`
		);
	}
}

function modelArgs(input: PromptInput): string[] {
	if (input.model) assertSafeBackendArg('model', input.model);
	return input.model ? ['--model', input.model] : [];
}

function normalizedReasoningEffort(input: PromptInput): string | undefined {
	if (!input.reasoningEffort) return undefined;
	assertSafeBackendArg('reasoningEffort', input.reasoningEffort);
	const normalized = normalizeReasoningEffort(input.reasoningEffort);
	if (normalized === undefined) {
		throw new Error(`Invalid reasoningEffort value: "${input.reasoningEffort}"`);
	}
	return normalized;
}

function claudeEffortArgs(input: PromptInput): string[] {
	const effort = normalizedReasoningEffort(input);
	if (effort === undefined || effort === 'none' || effort === 'minimal') return [];
	return ['--effort', effort];
}

function variantArgs(input: PromptInput): string[] {
	const effort = normalizedReasoningEffort(input);
	if (effort === undefined || effort === 'none') return [];
	return ['--variant', effort];
}

function thinkingArgs(input: PromptInput): string[] {
	if (input.thinking === true) return ['--thinking'];
	if (input.thinking === false) return ['--no-thinking'];
	return [];
}

// Grok Build takes the model via `-m` (not `--model`) and only accepts high/medium/low for
// --reasoning-effort, so xhigh is clamped to high and none/minimal are dropped.
function grokModelArgs(input: PromptInput): string[] {
	if (input.model) assertSafeBackendArg('model', input.model);
	return input.model ? ['-m', input.model] : [];
}

function grokEffortArgs(input: PromptInput): string[] {
	const effort = normalizedReasoningEffort(input);
	if (effort === undefined || effort === 'none' || effort === 'minimal') return [];
	return ['--reasoning-effort', effort === 'xhigh' ? 'high' : effort];
}

export function buildBackendCommand(backend: BackendName, input: PromptInput): BackendCommand {
	switch (backend) {
		case 'claude-code':
			return {
				args: [
					'--print',
					'--output-format',
					'stream-json',
					'--verbose',
					'--dangerously-skip-permissions',
					'--no-session-persistence',
					...modelArgs(input),
					...claudeEffortArgs(input),
				],
				command: 'claude',
			};
		case 'codex': {
			const effort = normalizedReasoningEffort(input);
			if (effort === 'max') throw new Error('Codex does not support max reasoning effort');
			const args = [
				'exec',
				'--json',
				'--skip-git-repo-check',
				'--dangerously-bypass-approvals-and-sandbox',
				'--cd',
				input.cwd,
				...modelArgs(input),
			];
			if (effort !== undefined) {
				args.push('-c', `model_reasoning_effort=${effort}`);
			}
			return { args, command: 'codex', env: { SHELL: '/usr/bin/bash' } };
		}
		case 'grok':
			// The single-turn prompt is delivered via `--prompt-file <tempfile>`, appended by
			// runProcessBackend (grok ignores piped stdin and only reads a prompt from an arg or
			// file). bypassPermissions is grok's --dangerously-skip-permissions equivalent.
			return {
				args: [
					'--output-format',
					'streaming-json',
					'--permission-mode',
					'bypassPermissions',
					...grokModelArgs(input),
					...grokEffortArgs(input),
				],
				command: 'grok',
			};
		case 'kilocode':
			return {
				args: [
					'run',
					'--format',
					'json',
					...modelArgs(input),
					...variantArgs(input),
					...thinkingArgs(input),
				],
				command: 'kilo',
			};
		case 'lmstudio':
		case 'native':
		case 'ollama':
		case 'openai':
			return {
				args: ['run', 'src/agent/loop.ts', ...modelArgs(input)],
				command: 'bun',
			};
		case 'opencode':
			return {
				args: [
					'run',
					'--format',
					'json',
					...modelArgs(input),
					...variantArgs(input),
					...thinkingArgs(input),
				],
				command: 'opencode',
			};
	}
}
