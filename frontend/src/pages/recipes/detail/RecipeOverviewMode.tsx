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
import { sectionCaptionClass } from '../../../lib/typography.ts';
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
		<div className="space-y-5">
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

			{/* The contract and policy badges used to float on the page background between the
			    header and the first card, reading as leftovers from the header rather than as the
			    recipe's contract. On a labelled panel they are a section like the ones below. */}
			<Card className="flex flex-wrap items-center gap-2" variant="panel">
				<span className={`mr-1 ${sectionCaptionClass}`}>Contract</span>
				<RecipeContractBadges recipe={recipe} />
				<RecipePolicyBadges recipe={recipe} />
			</Card>

			{showLaunch && (
				<RecipeLaunchPanel onClose={() => setShowLaunch(false)} recipe={recipe} />
			)}

			<RecipeParamsOverview parameters={recipe.parameters} />

			<Card>
				<CardHeader
					badge={
						<Badge tone="neutral">
							{recipe.steps.length} step{recipe.steps.length !== 1 ? 's' : ''}
						</Badge>
					}
					className="mb-4"
					title="Steps"
				/>
				<RecipePipelineView steps={recipe.steps} />
			</Card>
		</div>
	);
}
