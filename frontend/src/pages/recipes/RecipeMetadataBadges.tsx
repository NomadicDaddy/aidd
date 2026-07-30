import type { RecipeDefinition } from '../../api/types.ts';

import {
	applySkillExplainer,
	autoFixPolicyExplainer,
	continuePolicyExplainer,
	recipeMetadataOnlyExplainer,
	recipeSystemExplainer,
	retriesExplainer,
	reviewSkillExplainer,
	stopPolicyExplainer,
} from './recipe-badge-explainers.ts';
import { getRecipePolicySummary } from './recipe-policy.ts';
import { RecipeBadgeTooltip } from './RecipeBadgeTooltip.tsx';

export function RecipeContractBadges({ recipe }: { recipe: RecipeDefinition }) {
	return (
		<>
			{recipe.system === true && (
				<RecipeBadgeTooltip content={recipeSystemExplainer} tone="violet">
					system
				</RecipeBadgeTooltip>
			)}
			{recipe.metadataOnly === true && (
				<RecipeBadgeTooltip content={recipeMetadataOnlyExplainer} tone="amber">
					metadata-only
				</RecipeBadgeTooltip>
			)}
		</>
	);
}

export function RecipePolicyBadges({ recipe }: { recipe: RecipeDefinition }) {
	const policy = getRecipePolicySummary(recipe);
	return (
		<div className="flex flex-wrap gap-1.5">
			{policy.stopSteps > 0 && (
				<RecipeBadgeTooltip content={stopPolicyExplainer(policy.stopSteps)}>
					failure: stop ({policy.stopSteps})
				</RecipeBadgeTooltip>
			)}
			{policy.continueSteps > 0 && (
				<RecipeBadgeTooltip
					content={continuePolicyExplainer(policy.continueSteps)}
					tone="amber">
					failure: continue ({policy.continueSteps})
				</RecipeBadgeTooltip>
			)}
			{policy.autoFixSteps > 0 && (
				<RecipeBadgeTooltip
					content={autoFixPolicyExplainer(policy.autoFixSteps)}
					tone="teal">
					failure: auto-fix ({policy.autoFixSteps})
				</RecipeBadgeTooltip>
			)}
			{policy.retries > 0 && (
				<RecipeBadgeTooltip content={retriesExplainer(policy.retries)}>
					retries: {policy.retries}
				</RecipeBadgeTooltip>
			)}
			{policy.reviewSkillSteps > 0 && (
				<RecipeBadgeTooltip
					content={reviewSkillExplainer(policy.reviewSkillSteps)}
					tone="teal">
					skills: review ({policy.reviewSkillSteps})
				</RecipeBadgeTooltip>
			)}
			{policy.applySkillSteps > 0 && (
				<RecipeBadgeTooltip
					content={applySkillExplainer(policy.applySkillSteps)}
					tone="emerald">
					skills: apply ({policy.applySkillSteps})
				</RecipeBadgeTooltip>
			)}
		</div>
	);
}
