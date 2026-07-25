import type { RecipeParameterDefinition } from '../../../api/types.ts';

import { Card } from '../../../components/ui/card.tsx';

export function RecipeParamsOverview({ parameters }: { parameters: RecipeParameterDefinition[] }) {
	if (parameters.length === 0) return null;
	return (
		<Card>
			<h2 className="mb-3 text-sm font-semibold text-neutral-500 uppercase">Parameters</h2>
			<div className="flex flex-wrap gap-2">
				{parameters.map((param) => (
					<span
						className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-sm dark:bg-neutral-800"
						key={param.name}>
						<span className="font-medium text-foreground">{param.name}</span>
						{param.description && (
							<span className="text-neutral-500">{param.description}</span>
						)}
						{param.defaultValue !== undefined && (
							<span className="text-neutral-400">
								(default: {param.defaultValue})
							</span>
						)}
					</span>
				))}
			</div>
		</Card>
	);
}
