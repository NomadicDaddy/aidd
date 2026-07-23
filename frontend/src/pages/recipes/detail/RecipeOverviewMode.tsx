import { default as Ellipsis } from 'lucide-react/dist/esm/icons/ellipsis';
import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { RecipeDefinition } from '../../../api/types.ts';

import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { Button, IconButton } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { DropdownMenu } from '../../../components/ui/dropdown-menu.tsx';
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
					<div className="flex flex-wrap items-center gap-2">
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
					<Link className="hover:underline" to="/recipes">
						Recipes
					</Link>
				}
				description={recipe.description}
				helpSlug="recipes"
				title={recipe.name}
			/>

			<div className="flex flex-wrap items-center gap-2">
				<RecipeContractBadges recipe={recipe} />
				<RecipePolicyBadges recipe={recipe} />
			</div>

			{showLaunch && (
				<RecipeLaunchPanel onClose={() => setShowLaunch(false)} recipe={recipe} />
			)}

			<RecipeParamsOverview parameters={recipe.parameters} />

			<Card>
				<h2 className="mb-4 text-sm font-semibold text-neutral-500 uppercase">
					Pipeline ({recipe.steps.length} step{recipe.steps.length !== 1 ? 's' : ''})
				</h2>
				<RecipePipelineView steps={recipe.steps} />
			</Card>
		</div>
	);
}
