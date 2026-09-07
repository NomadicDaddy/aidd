import type { RecipeParameterDefinition } from '../../../api/types.ts';

import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { proseMeasureClass } from '../../../lib/typography.ts';
import { recipeParameterCountExplainer } from '../recipe-badge-explainers.ts';
import { RecipeBadgeTooltip } from '../RecipeBadgeTooltip.tsx';

export function RecipeParamsOverview({ parameters }: { parameters: RecipeParameterDefinition[] }) {
	if (parameters.length === 0) return null;
	return (
		<Card className="max-w-5xl">
			<CardHeader
				badge={
					<RecipeBadgeTooltip content={recipeParameterCountExplainer}>
						{parameters.length} {parameters.length === 1 ? 'parameter' : 'parameters'}
					</RecipeBadgeTooltip>
				}
				className="mb-3"
				title="Parameters"
			/>
			{/* A definition list rather than a wrap of pills: the pill run gave the name, the
			    description and the default equal weight inside one rounded blob, so no column of
			    names could be scanned. Names align left; everything about a parameter is its row. */}
			<dl className="grid max-w-5xl gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,max-content)_1fr]">
				{parameters.map((param) => (
					<div className="contents" key={param.name}>
						<dt className="font-mono text-sm font-medium break-words text-foreground">
							{param.name}
						</dt>
						<dd className={`text-sm text-muted-foreground ${proseMeasureClass}`}>
							{param.description ?? 'No description'}
							{param.defaultValue !== undefined && (
								<span className="mt-1 flex w-fit max-w-full gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
									<span className="shrink-0">default:</span>
									<span className="min-w-0 font-mono [overflow-wrap:anywhere] break-words">
										{param.defaultValue}
									</span>
								</span>
							)}
						</dd>
					</div>
				))}
			</dl>
		</Card>
	);
}
