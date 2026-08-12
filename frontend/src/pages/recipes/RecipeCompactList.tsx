import { default as ListTree } from 'lucide-react/dist/esm/icons/list-tree';
import { Link } from 'react-router';

import type { RecipeDefinition, ResourceUsageRow } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { formatUsageBadge } from '../../lib/usageBadge.ts';
import { RecipeLaunchButton, type RecipeLaunchProps } from './RecipeLaunchButton.tsx';
import { RecipeTypeBadge } from './RecipeMetadataBadges.tsx';

export function RecipeCompactList({
	recipes,
	usageByResourceId,
	...launch
}: {
	recipes: RecipeDefinition[];
	usageByResourceId: Map<string, ResourceUsageRow>;
} & RecipeLaunchProps) {
	return (
		<Card className="overflow-hidden">
			<ul aria-label="Compact recipe list" className="-m-4 divide-y divide-border">
				{recipes.map((recipe) => {
					const usageLine = formatUsageBadge(usageByResourceId.get(recipe.id));
					return (
						<li className="grid gap-3 p-3" key={recipe.id}>
							<div className="min-w-0">
								<h2 className="truncate">
									<Link
										className={`text-sm font-semibold text-foreground hover:underline ${touchTargetTextClass}`}
										to={`/recipes/${recipe.id}`}>
										{recipe.name}
									</Link>
								</h2>
								<p className="truncate font-mono text-xs text-muted-foreground">
									{recipe.id}
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-1.5">
								<RecipeTypeBadge isPipeline={recipe.steps.length > 1} plain />
								<Badge tone="neutral">
									{recipe.steps.length}{' '}
									{recipe.steps.length === 1 ? 'step' : 'steps'}
								</Badge>
								<Badge tone="neutral">
									{recipe.parameters.length}{' '}
									{recipe.parameters.length === 1 ? 'parameter' : 'parameters'}
								</Badge>
							</div>
							{usageLine ? (
								<p className="text-xs text-muted-foreground">{usageLine}</p>
							) : null}
							<div className="flex flex-wrap gap-2">
								<RecipeLaunchButton recipe={recipe} size="compact" {...launch} />
								<Link
									className={buttonClassName('secondary', undefined, 'compact')}
									to={`/recipes/${recipe.id}`}>
									<ListTree className="h-4 w-4" />
									Details
								</Link>
							</div>
						</li>
					);
				})}
			</ul>
		</Card>
	);
}
