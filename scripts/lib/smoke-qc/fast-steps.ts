import type { SmokeQcStep } from './steps.ts';

import { FAST_QC_STEP_NAMES } from './fast-subset.ts';

/**
 * Cached stand-ins used only by the fast inner-loop gate. The replacement name is also its cache
 * key, so a fast lint pass can never let the authoritative uncached full-gate lint step skip.
 */
export const FAST_STEP_OVERRIDES: Record<string, SmokeQcStep> = {
	lint: {
		command: ['bun', 'run', 'lint:fast'],
		description: 'Every workspace passes ESLint, with the cache the inner loop wants',
		label: 'lint (cached)',
		name: 'lint:fast',
	},
};

export function buildFastQcSteps(steps: SmokeQcStep[]): SmokeQcStep[] {
	return FAST_QC_STEP_NAMES.map((name) => {
		const step = steps.find((candidate) => candidate.name === name);
		if (step === undefined) {
			throw new Error(`smoke-qc: fast step '${name}' is not a smoke:qc step`);
		}
		return FAST_STEP_OVERRIDES[name] ?? step;
	});
}
