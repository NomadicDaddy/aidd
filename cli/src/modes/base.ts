import type {
	ModeContext,
	ModeHandler,
	ModeResult,
	ModeSummary,
	SelectedWork,
} from 'aidd-shared/modes/types';
import type { AgentRunResult } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import { type FeatureQuery, selectNextFeature } from 'aidd-shared/metadata/features';

export function createPlanBackedMode(plan: RunPlan): ModeHandler {
	return {
		async buildPromptPlan() {
			return plan.prompt;
		},
		async isComplete(_context: ModeContext, result: ModeResult): Promise<boolean> {
			return result.complete;
		},
		name: plan.mode,
		async processResult(_context: ModeContext, result: AgentRunResult): Promise<ModeResult> {
			return {
				complete: result.exitCode === 0,
				summary: `${plan.mode} finished with exit code ${result.exitCode}`,
			};
		},
		async selectWork(context: ModeContext): Promise<SelectedWork> {
			const query: FeatureQuery = { filters: plan.scope.filters };
			if (plan.scope.feature) query.featureDirectory = plan.scope.feature;
			if (plan.prompt.milestone?.featureDirectories) {
				query.milestoneFeatureDirectories = plan.prompt.milestone.featureDirectories;
			}
			const features = await context.store.listFeatures(query);
			const allFeatures = await context.store.listFeatures({ includeAudit: true });
			const selected = selectNextFeature(features, { allFeatures });
			if (selected) {
				return {
					data: selected,
					description: selected.title ?? selected.description ?? selected.id,
					id: selected.directory ?? selected.id,
				};
			}
			return {
				data: plan.scope,
				description: `Selected ${plan.mode} work`,
				id: plan.scope.feature ?? plan.mode,
			};
		},
		async summarize(_context: ModeContext, result: ModeResult): Promise<ModeSummary> {
			return { text: result.summary };
		},
	};
}
