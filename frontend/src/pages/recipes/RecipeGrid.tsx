import { default as ListTree } from 'lucide-react/dist/esm/icons/list-tree';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { Link } from 'react-router';

import type { RecipeDefinition, ResourceUsageRow } from '../../api/types.ts';

import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { formatUsageBadge } from '../../lib/usageBadge.ts';
import {
	recipeParameterCountExplainer,
	recipeStepCountExplainer,
	recipeStepTypeExplainer,
} from './recipe-badge-explainers.ts';
import { RecipeBadgeTooltip } from './RecipeBadgeTooltip.tsx';
import {
	RecipeContractBadges,
	RecipePolicyBadges,
	RecipeTypeBadge,
} from './RecipeMetadataBadges.tsx';

export function RecipeCard({
	launchDisabled,
	launchPending,
	onLaunch,
	recipe,
	usage,
}: {
	launchDisabled: boolean;
	launchPending: boolean;
	onLaunch: (recipe: RecipeDefinition) => void;
	recipe: RecipeDefinition;
	usage: ResourceUsageRow | undefined;
}) {
	const isPipeline = recipe.steps.length > 1;
	const usageLine = formatUsageBadge(usage);
	return (
		// `h-full` plus the `mt-auto` footer below: grid rows stretch to the tallest card, so a
		// short recipe would otherwise end mid-card and leave the row's remaining height as a void.
		<Card className="flex h-full flex-col" interactive>
			<div className="mb-3 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<Link
						className="text-base font-semibold text-foreground hover:underline"
						to={`/recipes/${recipe.id}`}>
						{recipe.name}
					</Link>
					<p className="truncate text-xs text-muted-foreground">{recipe.id}</p>
				</div>
				<div className="flex flex-wrap justify-end gap-1.5">
					<RecipeContractBadges recipe={recipe} />
					<RecipeTypeBadge isPipeline={isPipeline} />
				</div>
			</div>
			<p className="mb-4 min-h-10 text-sm text-muted-foreground">
				{recipe.description ?? 'No description'}
			</p>
			<div className="mb-4 flex flex-wrap gap-2">
				<RecipeBadgeTooltip content={recipeStepCountExplainer}>
					{recipe.steps.length} {recipe.steps.length === 1 ? 'step' : 'steps'}
				</RecipeBadgeTooltip>
				{recipe.parameters.length > 0 && (
					<RecipeBadgeTooltip content={recipeParameterCountExplainer} tone="amber">
						{recipe.parameters.length}{' '}
						{recipe.parameters.length === 1 ? 'parameter' : 'parameters'}
					</RecipeBadgeTooltip>
				)}
				{[...new Set(recipe.steps.map((step) => step.stepType))].map((stepType) => (
					<RecipeBadgeTooltip content={recipeStepTypeExplainer[stepType]} key={stepType}>
						{stepType}
					</RecipeBadgeTooltip>
				))}
			</div>
			<div className="mb-4">
				<RecipePolicyBadges recipe={recipe} />
			</div>
			{usageLine ? <p className="mb-3 text-xs text-muted-foreground">{usageLine}</p> : null}
			<div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
				<Button
					disabled={launchDisabled || launchPending}
					onClick={() => onLaunch(recipe)}
					variant="primary">
					<Send className="h-4 w-4" />
					Launch
				</Button>
				<Link className={buttonClassName()} to={`/recipes/${recipe.id}`}>
					<ListTree className="h-4 w-4" />
					Details
				</Link>
			</div>
		</Card>
	);
}

export function RecipeTable({
	launchDisabled,
	launchPending,
	onLaunch,
	recipes,
	usageByResourceId,
}: {
	launchDisabled: boolean;
	launchPending: boolean;
	onLaunch: (recipe: RecipeDefinition) => void;
	recipes: RecipeDefinition[];
	usageByResourceId: Map<string, ResourceUsageRow>;
}) {
	return (
		<Card className="overflow-x-auto p-0">
			<table aria-label="Recipes" className="w-full text-left text-sm">
				<thead className="border-b border-border bg-muted text-xs text-muted-foreground uppercase">
					<tr>
						<th className="px-3 py-3" scope="col">
							Name
						</th>
						<th className="px-3 py-3" scope="col">
							Type
						</th>
						<th className="px-3 py-3" scope="col">
							Steps
						</th>
						<th className="px-3 py-3" scope="col">
							Policies
						</th>
						<th className="px-3 py-3" scope="col">
							Parameters
						</th>
						<th className="px-3 py-3" scope="col">
							Usage
						</th>
						<th className="px-3 py-3" scope="col">
							Actions
						</th>
					</tr>
				</thead>
				<tbody>
					{recipes.map((recipe) => {
						const isPipeline = recipe.steps.length > 1;
						const usageLine = formatUsageBadge(usageByResourceId.get(recipe.id));
						return (
							<tr className="border-b border-border last:border-0" key={recipe.id}>
								<td className="px-3 py-3">
									<Link
										className="font-medium text-foreground hover:underline"
										to={`/recipes/${recipe.id}`}>
										{recipe.name}
									</Link>
									<div className="truncate text-xs text-muted-foreground">
										{recipe.id}
									</div>
								</td>
								<td className="px-3 py-3">
									<div className="flex flex-wrap gap-1.5">
										<RecipeTypeBadge isPipeline={isPipeline} />
										<RecipeContractBadges recipe={recipe} />
									</div>
								</td>
								<td className="px-3 py-3">{recipe.steps.length}</td>
								<td className="min-w-56 px-3 py-3">
									<RecipePolicyBadges recipe={recipe} />
								</td>
								<td className="px-3 py-3">{recipe.parameters.length}</td>
								<td className="px-3 py-3 text-xs text-muted-foreground">
									{usageLine ?? '—'}
								</td>
								<td className="px-3 py-3">
									<div className="flex flex-wrap gap-2">
										<Button
											disabled={launchDisabled || launchPending}
											onClick={() => onLaunch(recipe)}
											variant="primary">
											<Send className="h-4 w-4" />
											Launch
										</Button>
										<Link
											className={buttonClassName()}
											to={`/recipes/${recipe.id}`}>
											<ListTree className="h-4 w-4" />
											Details
										</Link>
									</div>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</Card>
	);
}
