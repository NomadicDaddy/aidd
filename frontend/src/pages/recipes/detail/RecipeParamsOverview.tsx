import type { RecipeParameterDefinition } from '../../../api/types.ts';

import { Card, CardHeader } from '../../../components/ui/card.tsx';

export function RecipeParamsOverview({ parameters }: { parameters: RecipeParameterDefinition[] }) {
	if (parameters.length === 0) return null;
	return (
		<Card>
			<CardHeader className="mb-3" title="Parameters" />
			{/* A definition list rather than a wrap of pills: the pill run gave the name, the
			    description and the default equal weight inside one rounded blob, so no column of
			    names could be scanned. Names align left; everything about a parameter is its row. */}
			<dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,max-content)_1fr]">
				{parameters.map((param) => (
					<div className="contents" key={param.name}>
						<dt className="font-mono text-sm font-medium break-words text-foreground">
							{param.name}
						</dt>
						<dd className="text-sm text-muted-foreground">
							{param.description ?? 'No description'}
							{param.defaultValue !== undefined && (
								<span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
									default: {param.defaultValue}
								</span>
							)}
						</dd>
					</div>
				))}
			</dl>
		</Card>
	);
}
