import type { RecipeStepDefinition, RecipeStepOnFailure } from '../../api/types.ts';

import {
	applySkillExplainer,
	autoFixPolicyExplainer,
	continuePolicyExplainer,
	retriesExplainer,
	reviewSkillExplainer,
	stopPolicyExplainer,
} from './recipe-badge-explainers.ts';

export interface RecipePolicyBadge {
	explainer: string;
	key: string;
	label: string;
	/**
	 * Whether the badge changes what happens when a step fails. `failure: continue`, `failure:
	 * auto-fix` and `retries` do; the rest of the summary is descriptive. Only the risk-bearing set
	 * earns a place on the catalog card — the full summary stays on the detail page.
	 */
	risk: boolean;
}

export interface RecipePolicySummary {
	applySkillSteps: number;
	autoFixSteps: number;
	continueSteps: number;
	retries: number;
	reviewSkillSteps: number;
	stopSteps: number;
}

/**
 * Everything the policy summary reads: the steps, and nothing else about the recipe.
 *
 * A saved `RecipeDefinition` satisfies this, and so does the live step draft the edit form holds —
 * which is the point. The summary used to be view-mode-only because it asked for a whole recipe, and
 * a recipe is the one thing the edit form does not have until Save succeeds.
 */
export interface RecipePolicySource {
	steps: readonly RecipeStepDefinition[];
}

export function getRecipePolicySummary(recipe: RecipePolicySource): RecipePolicySummary {
	const summary: RecipePolicySummary = {
		applySkillSteps: 0,
		autoFixSteps: 0,
		continueSteps: 0,
		retries: 0,
		reviewSkillSteps: 0,
		stopSteps: 0,
	};
	for (const step of recipe.steps) {
		const failurePolicy: RecipeStepOnFailure = step.onFailure ?? 'stop';
		if (failurePolicy === 'auto-fix') summary.autoFixSteps += 1;
		else if (failurePolicy === 'continue') summary.continueSteps += 1;
		else summary.stopSteps += 1;
		summary.retries += step.retryCount ?? (failurePolicy === 'auto-fix' ? 1 : 0);
		if (step.stepType !== 'skill') continue;
		if (step.configJson.executionIntent === 'review-only') summary.reviewSkillSteps += 1;
		if (step.configJson.executionIntent === 'apply-changes') summary.applySkillSteps += 1;
	}
	return summary;
}

/**
 * The policy summary as renderable badge descriptors.
 *
 * These carry no tone. Every one of them is a configuration reading — how the recipe is set up to
 * behave — and none of them says anything is wrong, so spending the status scale on them left an
 * amber `retries: 3` beside an amber `failure: continue (1)` on a perfectly healthy recipe. The
 * labels already name each fact, and `risk` is what decides which of them reach the catalog card.
 */
export function getRecipePolicyBadges(recipe: RecipePolicySource): RecipePolicyBadge[] {
	const policy = getRecipePolicySummary(recipe);
	const badges: RecipePolicyBadge[] = [];
	if (policy.stopSteps > 0) {
		badges.push({
			explainer: stopPolicyExplainer(policy.stopSteps),
			key: 'stop',
			label: `failure: stop (${policy.stopSteps})`,
			risk: false,
		});
	}
	if (policy.continueSteps > 0) {
		badges.push({
			explainer: continuePolicyExplainer(policy.continueSteps),
			key: 'continue',
			label: `failure: continue (${policy.continueSteps})`,
			risk: true,
		});
	}
	if (policy.autoFixSteps > 0) {
		badges.push({
			explainer: autoFixPolicyExplainer(policy.autoFixSteps),
			key: 'auto-fix',
			label: `failure: auto-fix (${policy.autoFixSteps})`,
			risk: true,
		});
	}
	if (policy.retries > 0) {
		badges.push({
			explainer: retriesExplainer(policy.retries),
			key: 'retries',
			label: `retries: ${policy.retries}`,
			risk: true,
		});
	}
	if (policy.reviewSkillSteps > 0) {
		badges.push({
			explainer: reviewSkillExplainer(policy.reviewSkillSteps),
			key: 'review',
			label: `skills: review (${policy.reviewSkillSteps})`,
			risk: false,
		});
	}
	if (policy.applySkillSteps > 0) {
		badges.push({
			explainer: applySkillExplainer(policy.applySkillSteps),
			key: 'apply',
			label: `skills: apply (${policy.applySkillSteps})`,
			risk: false,
		});
	}
	return badges;
}
