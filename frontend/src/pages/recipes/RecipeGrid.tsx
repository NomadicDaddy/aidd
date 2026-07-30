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
	recipeTypeExplainer,
} from './recipe-badge-explainers.ts';
import { RecipeBadgeTooltip } from './RecipeBadgeTooltip.tsx';
import { RecipeContractBadges, RecipePolicyBadges } from './RecipeMetadataBadges.tsx';

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
		<div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
			<div className="mb-3 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<Link
						className="text-base font-semibold text-neutral-950 hover:underline dark:text-neutral-50"
						to={`/recipes/${recipe.id}`}>
						{recipe.name}
					</Link>
					<p className="truncate text-xs text-neutral-500">{recipe.id}</p>
				</div>
				<div className="flex flex-wrap justify-end gap-1.5">
					<RecipeContractBadges recipe={recipe} />
					<RecipeBadgeTooltip
						content={recipeTypeExplainer[isPipeline ? 'pipeline' : 'single-step']}
						tone={isPipeline ? 'teal' : 'neutral'}>
						{isPipeline ? 'pipeline' : 'single-step'}
					</RecipeBadgeTooltip>
				</div>
			</div>
			<p className="mb-4 min-h-10 text-sm text-neutral-600 dark:text-neutral-300">
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
			{usageLine ? (
				<p className="mb-3 text-xs text-neutral-400 dark:text-neutral-500">{usageLine}</p>
			) : null}
			<div className="flex flex-wrap gap-2">
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
		</div>
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
				<thead className="border-b bg-neutral-50 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-900">
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
							<tr
								className="border-b last:border-0 dark:border-neutral-800"
								key={recipe.id}>
								<td className="px-3 py-3">
									<Link
										className="font-medium text-neutral-950 hover:underline dark:text-neutral-50"
										to={`/recipes/${recipe.id}`}>
										{recipe.name}
									</Link>
									<div className="truncate text-xs text-neutral-500">
										{recipe.id}
									</div>
								</td>
								<td className="px-3 py-3">
									<div className="flex flex-wrap gap-1.5">
										<RecipeBadgeTooltip
											content={
												recipeTypeExplainer[
													isPipeline ? 'pipeline' : 'single-step'
												]
											}
											tone={isPipeline ? 'teal' : 'neutral'}>
											{isPipeline ? 'pipeline' : 'single-step'}
										</RecipeBadgeTooltip>
										<RecipeContractBadges recipe={recipe} />
									</div>
								</td>
								<td className="px-3 py-3">{recipe.steps.length}</td>
								<td className="min-w-56 px-3 py-3">
									<RecipePolicyBadges recipe={recipe} />
								</td>
								<td className="px-3 py-3">{recipe.parameters.length}</td>
								<td className="px-3 py-3 text-xs text-neutral-500 dark:text-neutral-400">
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
