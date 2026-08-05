import { default as CircleDot } from 'lucide-react/dist/esm/icons/circle-dot';
import { default as ListTree } from 'lucide-react/dist/esm/icons/list-tree';

import type { RecipeDefinition } from '../../api/types.ts';

import {
	recipeMetadataOnlyExplainer,
	recipeSystemExplainer,
	recipeTypeExplainer,
} from './recipe-badge-explainers.ts';
import { getRecipePolicyBadges } from './recipe-policy.ts';
import { RecipeBadgeTooltip } from './RecipeBadgeTooltip.tsx';

// Pipeline vs single-step is taxonomy, so both variants stay neutral and are told apart by their
// glyph rather than by spending a status tone on shape-of-recipe.
export function RecipeTypeBadge({ isPipeline }: { isPipeline: boolean }) {
	const TypeIcon = isPipeline ? ListTree : CircleDot;
	return (
		<RecipeBadgeTooltip content={recipeTypeExplainer[isPipeline ? 'pipeline' : 'single-step']}>
			<TypeIcon aria-hidden="true" className="h-3 w-3" />
			{isPipeline ? 'pipeline' : 'single-step'}
		</RecipeBadgeTooltip>
	);
}

export function RecipeContractBadges({ recipe }: { recipe: RecipeDefinition }) {
	return (
		<>
			{/* `system` is the one contract fact the shell manages on the operator's behalf, which
			    is what violet means everywhere else. `metadata-only` is descriptive, so it stays
			    neutral instead of borrowing the attention tone from the policy badges beside it. */}
			{recipe.system === true && (
				<RecipeBadgeTooltip content={recipeSystemExplainer} tone="violet">
					system
				</RecipeBadgeTooltip>
			)}
			{recipe.metadataOnly === true && (
				<RecipeBadgeTooltip content={recipeMetadataOnlyExplainer}>
					metadata-only
				</RecipeBadgeTooltip>
			)}
		</>
	);
}

/**
 * The policy summary as badges. Renders a fragment, not a row: the catalog card folds these into
 * one shared wrap group with the step counts, so the wrapper belongs to the caller.
 *
 * `riskOnly` keeps just the badges that change failure behaviour; `limit` caps how many render and
 * folds the rest into a `+N` badge whose tooltip names them, so a table cell stays one line tall.
 */
export function RecipePolicyBadges({
	limit,
	recipe,
	riskOnly = false,
}: {
	limit?: number;
	recipe: RecipeDefinition;
	riskOnly?: boolean;
}) {
	const badges = getRecipePolicyBadges(recipe).filter((badge) => !riskOnly || badge.risk);
	const visible = limit === undefined ? badges : badges.slice(0, limit);
	const hidden = badges.slice(visible.length);
	return (
		<>
			{visible.map((badge) => (
				<RecipeBadgeTooltip content={badge.explainer} key={badge.key} tone={badge.tone}>
					{badge.label}
				</RecipeBadgeTooltip>
			))}
			{hidden.length > 0 && (
				<RecipeBadgeTooltip content={hidden.map((badge) => badge.label).join('\n')}>
					+{hidden.length}
				</RecipeBadgeTooltip>
			)}
		</>
	);
}
