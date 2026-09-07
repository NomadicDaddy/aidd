import { default as Ellipsis } from 'lucide-react/dist/esm/icons/ellipsis';
import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { useRef, useState } from 'react';

import type { RecipeDefinition } from '../../../api/types.ts';

import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { PageRail } from '../../../components/shared/PageRail.tsx';
import { Button, IconButton } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { DropdownMenu } from '../../../components/ui/dropdown-menu.tsx';
import { pageRailByContentType } from '../../../lib/contentRails.ts';
import { recipeStepCountExplainer } from '../recipe-badge-explainers.ts';
import { RecipeBadgeTooltip } from '../RecipeBadgeTooltip.tsx';
import { RecipeLaunchPanel } from '../RecipeLaunchPanel.tsx';
import {
	RecipeContractBadges,
	RecipePolicyBadges,
	RecipeTypeBadge,
} from '../RecipeMetadataBadges.tsx';
import { RecipePipelineView } from '../RecipePipelineView.tsx';
import { RecipeParamsOverview } from './RecipeParamsOverview.tsx';

interface Props {
	onDelete: () => void;
	onEdit: () => void;
	onReload: () => void;
	recipe: RecipeDefinition;
}

const PAGE_RAIL = pageRailByContentType.catalog;

export function RecipeOverviewMode({ onDelete, onEdit, onReload, recipe }: Props) {
	const [showLaunch, setShowLaunch] = useState(false);
	const launchTriggerRef = useRef<HTMLButtonElement>(null);
	const isPipeline = recipe.steps.length > 1;

	function closeLaunch(): void {
		setShowLaunch(false);
		launchTriggerRef.current?.focus();
	}

	return (
		// `page-reveal` here rather than on the wrapper `RecipeDetailPage` supplied: the stagger
		// animates a container's *direct children*, and that wrapper had exactly one, so the four
		// cards faded in together as a single block instead of in sequence. The other twenty routes
		// put `page-reveal` on the same element as their `space-y-5` root, which is this one.
		<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				actions={
					// Three controls, one of which is an icon: they fit on one line at every
					// breakpoint, and `flex-wrap` only ever let Edit fall under Launch mid-resize.
					<div className="flex flex-nowrap items-center gap-2">
						<Button
							onClick={() => setShowLaunch(true)}
							ref={launchTriggerRef}
							variant="primary">
							<Send className="h-4 w-4" />
							Launch
						</Button>
						<Button onClick={onEdit}>
							<Pencil className="h-4 w-4" />
							Edit
						</Button>
						<DropdownMenu
							items={[
								{
									icon: <RefreshCw className="h-4 w-4" />,
									label: 'Reload',
									onSelect: onReload,
								},
								{
									'data-tone': 'danger',
									disabled: recipe.system === true,
									icon: <Trash2 className="h-4 w-4" />,
									label:
										recipe.system === true
											? 'Delete (system protected)'
											: 'Delete',
									onSelect: onDelete,
								},
							]}
							trigger={({ ref, ...triggerProps }) => (
								<IconButton
									{...triggerProps}
									ariaLabel="Open recipe actions menu"
									ref={ref}
									variant="ghost">
									<Ellipsis aria-hidden="true" className="h-4 w-4" />
								</IconButton>
							)}
						/>
					</div>
				}
				breadcrumb={{ label: 'Recipes', to: '/recipes' }}
				description={recipe.description}
				helpSlug="recipes"
				identifier={
					<span className="inline-flex flex-wrap items-center gap-2">
						<span>{recipe.id}</span>
						<RecipeTypeBadge isPipeline={isPipeline} />
					</span>
				}
				title={recipe.name}
			/>

			{showLaunch && <RecipeLaunchPanel onClose={closeLaunch} recipe={recipe} />}

			<RecipeParamsOverview parameters={recipe.parameters} />

			<Card>
				{/* The contract and policy chips are not a card of their own: that is 1962px wide,
				    58px tall, and empty from 379px in. Every fact in them — `failure: stop (5)`,
				    `retries: 1`, `skills: apply (3)` — is a statement about the steps, so they read
				    beside the step count rather than as a section above it, and the page saves a
				    card and a gap. They also survive the flip into edit mode, where the summary of
				    the policy being edited would otherwise vanish; `RecipeEditMode` renders the
				    same chips off its live draft. */}
				<CardHeader
					badge={
						<>
							<RecipeBadgeTooltip content={recipeStepCountExplainer}>
								{recipe.steps.length} step{recipe.steps.length !== 1 ? 's' : ''}
							</RecipeBadgeTooltip>
							<RecipeContractBadges recipe={recipe} />
							<RecipePolicyBadges recipe={recipe} />
						</>
					}
					className="mb-4"
					title="Steps"
				/>
				<RecipePipelineView steps={recipe.steps} />
			</Card>
		</PageRail>
	);
}
