import { default as ListTree } from 'lucide-react/dist/esm/icons/list-tree';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { Link } from 'react-router';

import type { RecipeDefinition, ResourceUsageRow } from '../../api/types.ts';

import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { tableHeadClass } from '../../lib/tableStyles.ts';
import { formatUsageBadge, formatUsageBadgeCompact } from '../../lib/usageBadge.ts';
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

// Every Launch button on this page is dead until a project is picked, which is a filter-bar state
// the button itself cannot show. Both views point at the hint under the Project select instead of
// leaving thirty greyed buttons to explain themselves.
const launchHint = 'Choose a project to enable Launch';

interface LaunchProps {
	launchDisabled: boolean;
	launchHintId?: string;
	launchPending: boolean;
	onLaunch: (recipe: RecipeDefinition) => void;
}

function LaunchButton({
	launchDisabled,
	launchHintId,
	launchPending,
	onLaunch,
	recipe,
	size = 'default',
}: { recipe: RecipeDefinition; size?: 'compact' | 'default' } & LaunchProps) {
	return (
		<Button
			aria-describedby={launchDisabled ? launchHintId : undefined}
			disabled={launchDisabled || launchPending}
			onClick={() => onLaunch(recipe)}
			size={size}
			title={launchDisabled ? launchHint : undefined}
			variant="primary">
			<Send className="h-4 w-4" />
			Launch
		</Button>
	);
}

export function RecipeCard({
	recipe,
	usage,
	...launch
}: { recipe: RecipeDefinition; usage: ResourceUsageRow | undefined } & LaunchProps) {
	const isPipeline = recipe.steps.length > 1;
	const usageLine = formatUsageBadge(usage);
	return (
		// `h-full` plus the `mt-auto` footer below: grid rows stretch to the tallest card, so a
		// short recipe would otherwise end mid-card and leave the row's remaining height as a void.
		<Card className="flex h-full flex-col" interactive>
			{/* A heading, not a bare link: the catalog otherwise carries exactly one heading (the
			    page h1) and cannot be navigated card by card. The mono recipe id under it is
			    CardHeader's `identifier` slot — the absence of that slot is what made this card
			    hand-roll its header in the first place. */}
			<CardHeader
				action={
					<div className="flex shrink-0 flex-wrap justify-end gap-1.5">
						<RecipeContractBadges recipe={recipe} />
						<RecipeTypeBadge isPipeline={isPipeline} />
					</div>
				}
				className="mb-3"
				identifier={recipe.id}
				title={
					<Link
						className="hover:underline"
						title={recipe.name}
						to={`/recipes/${recipe.id}`}>
						{recipe.name}
					</Link>
				}
			/>
			<p className="mb-4 text-sm text-muted-foreground">
				{recipe.description ?? 'No description'}
			</p>
			{/* One facts row rather than three stacked ones, and only the policy badges that change
			    what happens on failure — the full policy summary is on the detail page. */}
			<div className="mb-4 flex flex-wrap gap-1.5">
				<RecipeBadgeTooltip content={recipeStepCountExplainer}>
					{recipe.steps.length} {recipe.steps.length === 1 ? 'step' : 'steps'}
				</RecipeBadgeTooltip>
				{recipe.parameters.length > 0 && (
					<RecipeBadgeTooltip content={recipeParameterCountExplainer}>
						{recipe.parameters.length}{' '}
						{recipe.parameters.length === 1 ? 'parameter' : 'parameters'}
					</RecipeBadgeTooltip>
				)}
				{[...new Set(recipe.steps.map((step) => step.stepType))].map((stepType) => (
					<RecipeBadgeTooltip content={recipeStepTypeExplainer[stepType]} key={stepType}>
						{stepType}
					</RecipeBadgeTooltip>
				))}
				<RecipePolicyBadges recipe={recipe} riskOnly />
			</div>
			{usageLine ? <p className="mb-3 text-xs text-muted-foreground">{usageLine}</p> : null}
			<div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
				<LaunchButton recipe={recipe} {...launch} />
				<Link className={buttonClassName()} to={`/recipes/${recipe.id}`}>
					<ListTree className="h-4 w-4" />
					Details
				</Link>
			</div>
		</Card>
	);
}

export function RecipeTable({
	recipes,
	usageByResourceId,
	...launch
}: {
	recipes: RecipeDefinition[];
	usageByResourceId: Map<string, ResourceUsageRow>;
} & LaunchProps) {
	return (
		<Card className="overflow-x-auto p-0">
			<table aria-label="Recipes" className="w-full text-left text-sm">
				<thead className={tableHeadClass}>
					<tr>
						<th className="px-3 py-2" scope="col">
							Name
						</th>
						<th className="px-3 py-2" scope="col">
							Type
						</th>
						{/* Counts are read down the column, so they are right-aligned on the shared
						    numeral width the baseline asks for. */}
						<th className="px-3 py-2 text-right" scope="col">
							Steps
						</th>
						<th className="px-3 py-2" scope="col">
							Policies
						</th>
						<th className="px-3 py-2 text-right" scope="col">
							Parameters
						</th>
						<th className="px-3 py-2" scope="col">
							Usage
						</th>
						<th className="px-3 py-2" scope="col">
							Actions
						</th>
					</tr>
				</thead>
				<tbody>
					{recipes.map((recipe) => {
						const usage = usageByResourceId.get(recipe.id);
						const usageLine = formatUsageBadgeCompact(usage);
						return (
							<tr className="border-b border-border last:border-0" key={recipe.id}>
								<td className="px-3 py-2">
									<Link
										className="font-medium text-foreground hover:underline"
										to={`/recipes/${recipe.id}`}>
										{recipe.name}
									</Link>
									<div className="truncate font-mono text-xs text-muted-foreground">
										{recipe.id}
									</div>
								</td>
								<td className="px-3 py-2">
									<div className="flex flex-nowrap items-center gap-1.5">
										<RecipeTypeBadge isPipeline={recipe.steps.length > 1} />
										<RecipeContractBadges recipe={recipe} />
									</div>
								</td>
								<td className="px-3 py-2 text-right tabular-nums">
									{recipe.steps.length}
								</td>
								{/* Two badges plus a `+N` that names the rest in its tooltip: the
								    column used to wrap six pills onto two rows and set the height
								    of every row in the table. */}
								<td className="min-w-56 px-3 py-2">
									<div className="flex flex-nowrap items-center gap-1.5 overflow-hidden">
										<RecipePolicyBadges limit={2} recipe={recipe} />
									</div>
								</td>
								<td className="px-3 py-2 text-right tabular-nums">
									{recipe.parameters.length}
								</td>
								<td
									className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground"
									title={formatUsageBadge(usage) ?? undefined}>
									{usageLine ?? '—'}
								</td>
								<td className="px-3 py-2">
									<div className="flex flex-nowrap items-center gap-2">
										<LaunchButton recipe={recipe} size="compact" {...launch} />
										<Link
											className={buttonClassName(
												'secondary',
												undefined,
												'compact',
											)}
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
