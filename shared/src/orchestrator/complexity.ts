import type { Feature } from '../metadata/features/types.ts';

export type ComplexityTier = 'high' | 'low' | 'medium';

/** Raw, backend-agnostic signals a feature carries that correlate with how much planning a
 * change needs. Derived from data already on `feature.json` — no extra model call. */
export interface ComplexitySignals {
	/** Number of declared dependencies (more deps → more cross-cutting → more planning). */
	dependencyCount: number;
	/** Combined title + description length in characters (longer brief → more scope). */
	textLength: number;
}

export interface ComplexityThresholds {
	/** `dependencyCount` at/above which the dependency signal contributes its points. */
	depsMedium: number;
	/** `textLength` at/above which the text signal contributes 1 point, then 2 at 3x. */
	textMedium: number;
}

export const defaultComplexityThresholds: ComplexityThresholds = {
	depsMedium: 1,
	textMedium: 400,
};

/** Map signals to a tier via a small, transparent additive score. Deliberately simple and
 * tunable rather than clever — the orchestrator uses the tier to scale planning depth, and a
 * misclassification only over- or under-plans, never breaks a run. */
export function classifyComplexity(
	signals: ComplexitySignals,
	thresholds: ComplexityThresholds = defaultComplexityThresholds
): ComplexityTier {
	let score = 0;
	if (signals.dependencyCount >= thresholds.depsMedium * 3) score += 2;
	else if (signals.dependencyCount >= thresholds.depsMedium) score += 1;
	if (signals.textLength >= thresholds.textMedium * 3) score += 2;
	else if (signals.textLength >= thresholds.textMedium) score += 1;
	if (score >= 3) return 'high';
	if (score >= 1) return 'medium';
	return 'low';
}

/** Extract complexity signals from a feature record. */
export function complexitySignalsForFeature(feature: Feature): ComplexitySignals {
	return {
		dependencyCount: feature.dependencies?.length ?? 0,
		textLength: (feature.title?.length ?? 0) + (feature.description?.length ?? 0),
	};
}
