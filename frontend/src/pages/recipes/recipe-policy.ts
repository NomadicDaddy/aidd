import type { RecipeDefinition, RecipeStepOnFailure } from '../../api/types.ts';
import type { Tone } from '../../lib/tones.ts';

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
	tone: Tone;
}

export interface RecipePolicySummary {
	applySkillSteps: number;
	autoFixSteps: number;
	continueSteps: number;
	retries: number;
	reviewSkillSteps: number;
	stopSteps: number;
}

export function getRecipePolicySummary(recipe: RecipeDefinition): RecipePolicySummary {
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
 * Tone here is deliberately narrow: the six-value scale means status, so a descriptive count
 * (`failure: stop`, `skills: apply`) stays neutral and only the three risk-bearing facts spend a
 * colour — amber for "it keeps going or tries again", teal for "it repairs itself or reviews
 * without writing". Otherwise an amber `2 parameters` sits beside an amber `failure: continue (1)`
 * and the badge that means something loses its privilege.
 */
export function getRecipePolicyBadges(recipe: RecipeDefinition): RecipePolicyBadge[] {
	const policy = getRecipePolicySummary(recipe);
	const badges: RecipePolicyBadge[] = [];
	if (policy.stopSteps > 0) {
		badges.push({
			explainer: stopPolicyExplainer(policy.stopSteps),
			key: 'stop',
			label: `failure: stop (${policy.stopSteps})`,
			risk: false,
			tone: 'neutral',
		});
	}
	if (policy.continueSteps > 0) {
		badges.push({
			explainer: continuePolicyExplainer(policy.continueSteps),
			key: 'continue',
			label: `failure: continue (${policy.continueSteps})`,
			risk: true,
			tone: 'amber',
		});
	}
	if (policy.autoFixSteps > 0) {
		badges.push({
			explainer: autoFixPolicyExplainer(policy.autoFixSteps),
			key: 'auto-fix',
			label: `failure: auto-fix (${policy.autoFixSteps})`,
			risk: true,
			tone: 'teal',
		});
	}
	if (policy.retries > 0) {
		badges.push({
			explainer: retriesExplainer(policy.retries),
			key: 'retries',
			label: `retries: ${policy.retries}`,
			risk: true,
			tone: 'amber',
		});
	}
	if (policy.reviewSkillSteps > 0) {
		badges.push({
			explainer: reviewSkillExplainer(policy.reviewSkillSteps),
			key: 'review',
			label: `skills: review (${policy.reviewSkillSteps})`,
			risk: false,
			tone: 'teal',
		});
	}
	if (policy.applySkillSteps > 0) {
		badges.push({
			explainer: applySkillExplainer(policy.applySkillSteps),
			key: 'apply',
			label: `skills: apply (${policy.applySkillSteps})`,
			risk: false,
			tone: 'neutral',
		});
	}
	return badges;
}
