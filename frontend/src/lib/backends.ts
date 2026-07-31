import { backendNames } from 'aidd-shared/plan/types';

import type { BackendName } from '../api/types.ts';

// Single source of backend options for every select in the app, derived from the
// canonical shared list so a new backend appears everywhere at once.
const backendLabels: Record<BackendName, string> = {
	'claude-code': 'Claude Code',
	cline: 'Cline',
	codex: 'Codex',
	grok: 'Grok',
	kilocode: 'KiloCode',
	lmstudio: 'LM Studio',
	native: 'Native',
	ollama: 'Ollama',
	openai: 'OpenAI',
	opencode: 'OpenCode',
};

export const backendOptions: { label: string; value: BackendName }[] = backendNames.map(
	(value) => ({ label: backendLabels[value], value }),
);

export function backendLabel(value: null | string | undefined): string {
	if (!value) return '';
	return backendLabels[value as BackendName] ?? value;
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
