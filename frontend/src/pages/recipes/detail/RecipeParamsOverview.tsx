import type { RecipeParameterDefinition } from '../../../api/types.ts';

import { Card, CardHeader } from '../../../components/ui/card.tsx';

export function RecipeParamsOverview({ parameters }: { parameters: RecipeParameterDefinition[] }) {
	if (parameters.length === 0) return null;
	return (
		<Card>
			<CardHeader className="mb-3" title="Parameters" />
			<div className="flex flex-wrap gap-2">
				{parameters.map((param) => (
					<span
						className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-sm"
						key={param.name}>
						<span className="font-medium text-foreground">{param.name}</span>
						{param.description && (
							<span className="text-muted-foreground">{param.description}</span>
						)}
						{param.defaultValue !== undefined && (
							<span className="text-muted-foreground">
								(default: {param.defaultValue})
							</span>
						)}
					</span>
				))}
			</div>
		</Card>
	);
}
