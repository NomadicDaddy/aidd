import type { BenchmarkManifest, BenchmarkStack, TokenUsage } from './types.ts';

/** Pricing with optional fields resolved to concrete numbers. */
export interface ResolvedModelPricing {
	cachedPerMtok: number;
	inputPerMtok: number;
	outputPerMtok: number;
	reasoningPerMtok: number;
}

const PER_MTOK = 1_000_000;

function resolveEntry(entry: BenchmarkManifest['pricing'][string]): ResolvedModelPricing {
	return {
		cachedPerMtok: entry.cachedPerMtok ?? 0,
		inputPerMtok: entry.inputPerMtok,
		outputPerMtok: entry.outputPerMtok,
		reasoningPerMtok: entry.reasoningPerMtok ?? 0,
	};
}

function familyForStack(stack: BenchmarkStack, manifest: BenchmarkManifest): string | undefined {
	for (const cohort of manifest.cohorts) {
		if (cohort.members.includes(stack.label)) return cohort.targetModelFamily;
	}
	return undefined;
}

/** Resolve the pricing entry that applies to a stack via its cohort's target model
 * family. Returns undefined when no family is found or no entry is configured for it
 * (e.g. local models, or families whose metered cost is trusted directly). */
export function pricingForStack(
	stack: BenchmarkStack,
	manifest: BenchmarkManifest
): ResolvedModelPricing | undefined {
	const family = familyForStack(stack, manifest);
	if (!family) return undefined;
	const entry = manifest.pricing[family];
	return entry ? resolveEntry(entry) : undefined;
}

/** Estimate a run's dollar cost from token usage and a pricing table.
 *
 * Token-subset model (OpenAI/OpenAI-compatible usage convention):
 * - `cachedTokens` is a subset of `inputTokens` (prompt_tokens_details.cached_tokens),
 *   billed at the cheaper `cachedPerMtok`. The cached slice is therefore charged at
 *   its discounted rate INSTEAD of the full input rate, so it is never billed twice.
 * - `reasoningTokens` is a subset of `outputTokens` (output_tokens_details.reasoning_tokens),
 *   billed at the output rate. `reasoningPerMtok` defaults to 0 on purpose: reasoning is
 *   already covered by `outputPerMtok`, and a non-zero value would double-count it. Set it
 *   only for a provider confirmed to report reasoning DISJOINT from output. */
export function estimateCostFromTokens(usage: TokenUsage, pricing: ResolvedModelPricing): number {
	const nonCachedInput = Math.max(0, usage.inputTokens - usage.cachedTokens);
	const cost =
		(nonCachedInput / PER_MTOK) * pricing.inputPerMtok +
		(usage.cachedTokens / PER_MTOK) * pricing.cachedPerMtok +
		(usage.outputTokens / PER_MTOK) * pricing.outputPerMtok +
		(usage.reasoningTokens / PER_MTOK) * pricing.reasoningPerMtok;
	return Math.round(cost * PER_MTOK) / PER_MTOK;
}

/** Decide a run's final cost.
 *
 * - No pricing for the family (local models, or trusted-metered families) -> keep the
 *   backend-reported cost as-is.
 * - A positive reported cost is authoritative metered spend -> trust it. Some backends
 *   (e.g. claude-code) emit reliable cost but unreliable token counts.
 * - No reported cost but real token usage -> estimate from tokens. Backends like native
 *   and codex report tokens but no dollars.
 * - No reported cost and no usable token data -> unknown (null), never a fake zero. */
export function resolveCost(
	reportedCost: null | number,
	usage: TokenUsage,
	pricing: ResolvedModelPricing | undefined
): null | number {
	if (!pricing) return reportedCost;
	if (reportedCost !== null && reportedCost > 0) return reportedCost;
	if (!usage.known) return null;
	return estimateCostFromTokens(usage, pricing);
}
