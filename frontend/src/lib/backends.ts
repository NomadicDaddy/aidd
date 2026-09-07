import { backendNames } from 'aidd-shared/plan/types';

import type { BackendName } from '../api/types.ts';

// Single source of backend options for every select in the app, derived from the
// canonical shared list so a new backend appears everywhere at once.
const backendLabels: Record<'direct' | BackendName, string> = {
	'claude-code': 'Claude Code',
	cline: 'Cline',
	codex: 'Codex',
	direct: 'Direct AI',
	grok: 'Grok',
	kilocode: 'KiloCode',
	lmstudio: 'LM Studio',
	native: 'Native',
	ollama: 'Ollama',
	openai: 'OpenAI',
	opencode: 'OpenCode',
};

const providerLabels: Record<string, string> = {
	lmstudio: 'LM Studio',
	ollama: 'Ollama',
	openai: 'OpenAI',
	xai: 'xAI',
	zhipu: 'Zhipu',
};

export function backendHasDisplayLabel(value: null | string | undefined): boolean {
	return value !== null && value !== undefined && Object.hasOwn(backendLabels, value);
}

export function providerHasDisplayLabel(value: null | string | undefined): boolean {
	return value !== null && value !== undefined && Object.hasOwn(providerLabels, value);
}

export const backendOptions: { label: string; value: BackendName }[] = backendNames.map(
	(value) => ({ label: backendLabels[value], value }),
);

export function backendLabel(value: null | string | undefined): string {
	if (!value) return '';
	return backendLabels[value as keyof typeof backendLabels] ?? value;
}

export function providerLabel(value: null | string | undefined): string {
	if (!value) return '';
	return providerLabels[value] ?? value;
}

export function providerOptions(values: readonly string[]): { label: string; value: string }[] {
	return values.map((value) => ({ label: providerLabel(value), value }));
}

// Backends whose CLI streams less than the console can render. Stated up front so an empty
// section reads as a known limit of that CLI rather than as aidd having dropped the events.
const consoleStreamLimits: Partial<Record<BackendName, string>> = {
	grok: 'Grok’s streaming output carries assistant text and reasoning only — its CLI emits no tool events, so this run’s tool calls cannot be shown.',
};

export function backendConsoleLimit(value: null | string | undefined): string | undefined {
	if (!value) return undefined;
	return consoleStreamLimits[value as BackendName];
}
