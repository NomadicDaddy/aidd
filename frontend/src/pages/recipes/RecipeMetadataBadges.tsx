import type { RecipeDefinition } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { getRecipePolicySummary } from './recipe-policy.ts';

export function RecipeContractBadges({ recipe }: { recipe: RecipeDefinition }) {
	return (
		<>
			{recipe.system === true && <Badge tone="violet">system</Badge>}
			{recipe.metadataOnly === true && <Badge tone="amber">metadata-only</Badge>}
		</>
	);
}

export function RecipePolicyBadges({ recipe }: { recipe: RecipeDefinition }) {
	const policy = getRecipePolicySummary(recipe);
	return (
		<div className="flex flex-wrap gap-1.5">
			{policy.stopSteps > 0 && (
				<Badge tone="neutral">failure: stop ({policy.stopSteps})</Badge>
			)}
			{policy.continueSteps > 0 && (
				<Badge tone="amber">failure: continue ({policy.continueSteps})</Badge>
			)}
			{policy.autoFixSteps > 0 && (
				<Badge tone="teal">failure: auto-fix ({policy.autoFixSteps})</Badge>
			)}
			{policy.retries > 0 && <Badge tone="neutral">retries: {policy.retries}</Badge>}
			{policy.reviewSkillSteps > 0 && (
				<Badge tone="teal">skills: review ({policy.reviewSkillSteps})</Badge>
			)}
			{policy.applySkillSteps > 0 && (
				<Badge tone="emerald">skills: apply ({policy.applySkillSteps})</Badge>
			)}
		</div>
	);
}
