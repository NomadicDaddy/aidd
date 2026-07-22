import { isKnownSmokeCacheStep } from '../smoke-cache/dependencies.ts';

/**
 * Every smoke:qc step must be classified: either it declares cache dependencies, or it is named in
 * UNCACHEABLE_STEPS as deliberately uncacheable. An unclassified step is silently uncacheable — it
 * runs every time and nobody notices, which is how a step that should have been cached stays slow
 * for months, and how a step that must never be cached looks identical to one nobody got to yet.
 *
 * `test/scripts/smoke-qc-fast.test.ts` asserts the same property, but a test only fails in CI or on
 * a full run. Checking at startup fails on the very first `smoke:qc` after someone adds a step,
 * which is when the classification decision is still in their head. Ported from spernakit, which
 * has no unit-test framework and so has only ever had the runtime guard.
 */
export function assertSmokeCacheCoverage(stepNames: string[]): void {
	const unclassified = stepNames.filter((name) => !isKnownSmokeCacheStep(name));
	if (unclassified.length > 0) {
		throw new Error(`QC steps need cache classifications: ${unclassified.join(', ')}`);
	}
}
