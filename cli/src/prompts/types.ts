import type { PromptFragmentRef } from 'aidd-shared/plan/types';

export interface CompiledPrompt {
	fragments: PromptFragmentRef[];
	snapshotKey: string;
	text: string;
}
