import { default as Ellipsis } from 'lucide-react/dist/esm/icons/ellipsis';
import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { useState } from 'react';
import { Link } from 'react-router';

import type { RecipeDefinition } from '../../../api/types.ts';

import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button, IconButton } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { DropdownMenu } from '../../../components/ui/dropdown-menu.tsx';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { RecipeLaunchPanel } from '../RecipeLaunchPanel.tsx';
import { RecipeContractBadges, RecipePolicyBadges } from '../RecipeMetadataBadges.tsx';
import { RecipePipelineView } from '../RecipePipelineView.tsx';
import { RecipeParamsOverview } from './RecipeParamsOverview.tsx';

interface Props {
	onDelete: () => void;
	onEdit: () => void;
	onReload: () => void;
	recipe: RecipeDefinition;
}

export function RecipeOverviewMode({ onDelete, onEdit, onReload, recipe }: Props) {
	const [showLaunch, setShowLaunch] = useState(false);

	return (
		// `page-reveal` here rather than on the wrapper `RecipeDetailPage` supplied: the stagger
		// animates a container's *direct children*, and that wrapper had exactly one, so the four
		// cards faded in together as a single block instead of in sequence. The other twenty routes
		// put `page-reveal` on the same element as their `space-y-5` root, which is this one.
		<div className="page-reveal space-y-5">
			<PageHeader
				actions={
					// Three controls, one of which is an icon: they fit on one line at every
					// breakpoint, and `flex-wrap` only ever let Edit fall under Launch mid-resize.
					<div className="flex flex-nowrap items-center gap-2">
						<Button onClick={() => setShowLaunch(true)} variant="primary">
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
				breadcrumb={
					<Link className={`hover:underline ${touchTargetTextClass}`} to="/recipes">
						Recipes
					</Link>
				}
				description={recipe.description}
				helpSlug="recipes"
				identifier={recipe.id}
				title={recipe.name}
			/>

			{showLaunch && (
				<RecipeLaunchPanel onClose={() => setShowLaunch(false)} recipe={recipe} />
			)}

			<RecipeParamsOverview parameters={recipe.parameters} />

			<Card>
				{/* The contract and policy chips used to be a card of their own: 1962px wide, 58px
				    tall, and empty from 379px in. Every fact in it — `failure: stop (5)`,
				    `retries: 1`, `skills: apply (3)` — is a statement about the steps, so it reads
				    beside the step count rather than as a section above it, and the page loses a
				    card and a gap. It also survives the flip into edit mode, where the summary of
				    the policy being edited used to disappear entirely; `RecipeEditMode` renders the
				    same chips off its live draft. */}
				<CardHeader
					badge={
						<>
							<Badge tone="neutral">
								{recipe.steps.length} step{recipe.steps.length !== 1 ? 's' : ''}
							</Badge>
							<RecipeContractBadges recipe={recipe} />
							<RecipePolicyBadges recipe={recipe} />
						</>
					}
					className="mb-4"
					title="Steps"
				/>
				<RecipePipelineView steps={recipe.steps} />
			</Card>
		</div>
	);
}
