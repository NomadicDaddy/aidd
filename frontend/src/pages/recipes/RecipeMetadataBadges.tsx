import { default as CircleDot } from 'lucide-react/dist/esm/icons/circle-dot';
import { default as ListTree } from 'lucide-react/dist/esm/icons/list-tree';

import type { RecipeDefinition } from '../../api/types.ts';

import {
	recipeMetadataOnlyExplainer,
	recipeStepTypeExplainer,
	recipeSystemExplainer,
	recipeTypeExplainer,
} from './recipe-badge-explainers.ts';
import { getRecipePolicyBadges, type RecipePolicySource } from './recipe-policy.ts';
import { RecipeBadgeTooltip } from './RecipeBadgeTooltip.tsx';

/**
 * Passed straight through to `RecipeBadgeTooltip`, which explains why the catalog sets it: 198 of
 * the 314 focusable elements on the loaded list were tooltip-only badge buttons. Every one of these
 * components renders on both the catalog and a recipe's own page, so the choice belongs to the
 * caller rather than to the badge.
 */
interface PlainProp {
	plain?: boolean;
}

// Pipeline vs single-step is taxonomy, so both variants stay neutral and are told apart by their
// glyph rather than by spending a status tone on shape-of-recipe.
export function RecipeTypeBadge({
	isPipeline,
	plain = false,
}: { isPipeline: boolean } & PlainProp) {
	const TypeIcon = isPipeline ? ListTree : CircleDot;
	return (
		<RecipeBadgeTooltip
			content={recipeTypeExplainer[isPipeline ? 'pipeline' : 'single-step']}
			plain={plain}>
			<TypeIcon aria-hidden="true" className="h-3 w-3" />
			{isPipeline ? 'pipeline' : 'single-step'}
		</RecipeBadgeTooltip>
	);
}

/**
 * The distinct step types a recipe is built from, in first-use order.
 *
 * Shared rather than inlined per view: the card listed these and the table did not, so the same
 * recipe was a `shell` recipe in one view and an untyped row in the other, and switching views
 * changed what you knew about it.
 */
export function RecipeStepTypeBadges({
	plain = false,
	recipe,
}: { recipe: RecipeDefinition } & PlainProp) {
	return (
		<>
			{[...new Set(recipe.steps.map((step) => step.stepType))].map((stepType) => (
				<RecipeBadgeTooltip
					content={recipeStepTypeExplainer[stepType]}
					key={stepType}
					plain={plain}>
					{stepType}
				</RecipeBadgeTooltip>
			))}
		</>
	);
}

export function RecipeContractBadges({
	plain = false,
	recipe,
}: { recipe: RecipeDefinition } & PlainProp) {
	return (
		<>
			{/* `system` is the one contract fact the shell manages on the operator's behalf, which
			    is what violet means everywhere else. `metadata-only` is descriptive, so it stays
			    neutral instead of borrowing the attention tone from the policy badges beside it. */}
			{recipe.system === true && (
				<RecipeBadgeTooltip content={recipeSystemExplainer} plain={plain} tone="violet">
					system
				</RecipeBadgeTooltip>
			)}
			{recipe.metadataOnly === true && (
				<RecipeBadgeTooltip content={recipeMetadataOnlyExplainer} plain={plain}>
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
 *
 * The source is `RecipePolicySource` rather than a whole `RecipeDefinition` because the edit form
 * renders these too, off its own step draft, and it has no saved recipe to hand until Save returns.
 */
export function RecipePolicyBadges({
	limit,
	plain = false,
	recipe,
	riskOnly = false,
}: {
	limit?: number;
	recipe: RecipePolicySource;
	riskOnly?: boolean;
} & PlainProp) {
	const badges = getRecipePolicyBadges(recipe).filter((badge) => !riskOnly || badge.risk);
	const visible = limit === undefined ? badges : badges.slice(0, limit);
	const hidden = badges.slice(visible.length);
	return (
		<>
			{visible.map((badge) => (
				<RecipeBadgeTooltip content={badge.explainer} key={badge.key} plain={plain}>
					{badge.label}
				</RecipeBadgeTooltip>
			))}
			{hidden.length > 0 && (
				<RecipeBadgeTooltip
					content={hidden.map((badge) => badge.label).join('\n')}
					plain={plain}>
					+{hidden.length}
				</RecipeBadgeTooltip>
			)}
		</>
	);
}
