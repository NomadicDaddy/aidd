import { default as ListTree } from 'lucide-react/dist/esm/icons/list-tree';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { Link } from 'react-router';

import type { RecipeDefinition, ResourceUsageRow } from '../../api/types.ts';

import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { tableHeadClass } from '../../lib/tableStyles.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { formatUsageBadge, formatUsageBadgeCompact } from '../../lib/usageBadge.ts';
import {
	recipeParameterCountExplainer,
	recipeStepCountExplainer,
} from './recipe-badge-explainers.ts';
import { launchHint } from './recipe-launch.ts';
import { RecipeBadgeTooltip } from './RecipeBadgeTooltip.tsx';
import {
	RecipeContractBadges,
	RecipePolicyBadges,
	RecipeStepTypeBadges,
	RecipeTypeBadge,
} from './RecipeMetadataBadges.tsx';

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
						className={`hover:underline ${touchTargetTextClass}`}
						title={recipe.name}
						to={`/recipes/${recipe.id}`}>
						{recipe.name}
					</Link>
				}
			/>
			{/* Two lines and the rest on `title`. A description is free text from a file on disk, so
			    one recipe ran to six lines and, because grid rows stretch to their tallest card, set
			    the height of every card beside it — the block that decided the row was the one field
			    nothing else on the card depends on. */}
			<p
				className="mb-4 line-clamp-2 text-sm text-muted-foreground"
				title={recipe.description ?? 'No description'}>
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
				<RecipeStepTypeBadges recipe={recipe} />
				<RecipePolicyBadges limit={3} recipe={recipe} riskOnly />
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
		<>
			{/* The Table toggle is a user choice, and honouring it at 390px meant eight columns in a
			    358px column. The stack is `RecipeCard` itself rather than a second card layout: it
			    already carries every column this table has — name, id, description, type and contract
			    badges, step and parameter counts, step-type and policy badges, the usage line, Launch
			    and Details — so a phone-width Table view is the catalog's own card, not a reduction.

			    Eight columns come to roughly 1160px of minimum width: 200px of name over a mono id,
			    140px for the type and contract badges, 70px for a right-aligned count, 140px of
			    step-type badges, the policy cell's declared `min-w-56` (224px), 90px for parameters,
			    120px of nowrap usage, and 180px for a compact Launch beside a compact Details. `xl`
			    is the tier where the 992px content column an expanded rail leaves gets close enough
			    that the scrollport is carrying a scroll rather than hiding most of the table. */}
			<div className="grid gap-3 xl:hidden">
				{recipes.map((recipe) => (
					<RecipeCard
						key={recipe.id}
						recipe={recipe}
						usage={usageByResourceId.get(recipe.id)}
						{...launch}
					/>
				))}
			</div>
			<Card className="hidden p-0 xl:block">
				<OverflowScroller ariaLabel="Recipes">
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
								{/* The card names what a recipe is built from and the table did not, so
							    the same recipe was a `shell` recipe in one view and an untyped row
							    in the other. */}
								<th className="px-3 py-2" scope="col">
									Step types
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
									<tr
										className="border-b border-border last:border-0"
										key={recipe.id}>
										{/* The description is the card's fourth line and the table has no
								    room for it, so it hangs off the identity cell rather than
								    being a fact only one of the two views has at all. */}
										<td
											className="px-3 py-2"
											title={recipe.description ?? 'No description'}>
											<Link
												className={`font-medium text-foreground hover:underline ${touchTargetTextClass}`}
												to={`/recipes/${recipe.id}`}>
												{recipe.name}
											</Link>
											<div className="truncate font-mono text-xs text-muted-foreground">
												{recipe.id}
											</div>
										</td>
										<td className="px-3 py-2">
											<div className="flex flex-nowrap items-center gap-1.5">
												<RecipeTypeBadge
													isPipeline={recipe.steps.length > 1}
												/>
												<RecipeContractBadges recipe={recipe} />
											</div>
										</td>
										<td className="px-3 py-2 text-right tabular-nums">
											{recipe.steps.length}
										</td>
										<td className="px-3 py-2">
											<div className="flex flex-nowrap items-center gap-1.5 overflow-hidden">
												<RecipeStepTypeBadges recipe={recipe} />
											</div>
										</td>
										{/* The same risk-only summary the card shows, capped at the three
								    badges that summary can produce: the column used to list the
								    whole policy set, so a row said `failure: stop (3)` — the
								    default, for every recipe — while the card said only what
								    departed from it. */}
										<td className="min-w-56 px-3 py-2">
											<div className="flex flex-nowrap items-center gap-1.5 overflow-hidden">
												<RecipePolicyBadges
													limit={3}
													recipe={recipe}
													riskOnly
												/>
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
												<LaunchButton
													recipe={recipe}
													size="compact"
													{...launch}
												/>
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
				</OverflowScroller>
			</Card>
		</>
	);
}
