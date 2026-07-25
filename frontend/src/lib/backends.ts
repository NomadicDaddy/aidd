import { backendNames } from 'aidd-shared/plan/types';

import type { BackendName } from '../api/types.ts';

// Single source of backend options for every select in the app, derived from the
// canonical shared list so a new backend appears everywhere at once.
const backendLabels: Record<BackendName, string> = {
	'claude-code': 'Claude Code',
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
