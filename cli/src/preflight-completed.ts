import type { AiddStore } from 'aidd-shared/metadata/store';
import type { RunPlan } from 'aidd-shared/plan/types';
import type { AiddRunProvenance } from 'aidd-shared/run-provenance';

import { explicitFeatureTarget } from './modes/coding/selection.ts';
import { runRuntimeFields } from './orchestrator/run/types.ts';

export interface CompletedFeatureResult {
	featureId: string;
	message: string;
}

/**
 * When an explicit --feature (or --filter-by id --filter <value>) targets a
 * feature that is already status: completed + passes: true, return a result
 * that tells the caller to exit immediately with a successful no-work result.
 * There is nothing left to do for the requested feature, so spending an agent
 * iteration on it only risks re-doing completed work; the caller records a
 * no-work run summary instead so history still attributes the feature.
 */
export async function checkExplicitCompletedFeature(
	plan: RunPlan,
	store: AiddStore,
): Promise<CompletedFeatureResult | undefined> {
	const target = explicitFeatureTarget(plan);
	if (!target) return undefined;
	try {
		const feature = await store.readFeature(target);
		if (feature.status === 'completed' && feature.passes === true) {
			return {
				featureId: feature.id ?? target,
				message: `Requested feature '${target}' is already completed (status: completed, passes: true). Exiting with no work.`,
			};
		}
	} catch {
		// Feature file does not exist or is unreadable — let the orchestrator
		// handle the missing feature case through normal selection/error flow.
		return undefined;
	}
	return undefined;
}

/**
 * Write a minimal run summary for an early completed-feature exit so that
 * web history and attribution show the requested feature as both selected
 * and completed.
 */
export async function writeCompletedFeatureRunSummary(
	store: AiddStore,
	plan: RunPlan,
	result: CompletedFeatureResult,
	aiddProvenance: AiddRunProvenance,
): Promise<void> {
	const now = Date.now();
	await store.appendRunSummary({
		...aiddProvenance,
		...runRuntimeFields(plan),
		completedFeatures: [result.featureId],
		durationMs: 0,
		endedAt: new Date(now).toISOString(),
		exitCode: 0,
		fileChangePathsTruncated: false,
		filesCreated: [],
		filesEdited: [],
		runId: `pre_${crypto.randomUUID().slice(0, 8)}`,
		runLedgerDirty: true,
		scopeOverrun: false,
		selectedFeatures: [result.featureId],
		source: 'cli',
		startedAt: new Date(now).toISOString(),
		stopReason: 'already_completed' as string,
		summary: result.message,
		totals: {
			cachedTokens: 0,
			costUsd: 0,
			errors: 0,
			filesCreated: 0,
			filesEdited: 0,
			idleWarnings: 0,
			inputTokens: 0,
			iterations: 0,
			outputTokens: 0,
			rateLimits: 0,
			reasoningTokens: 0,
			toolCalls: 0,
		},
	});
}
