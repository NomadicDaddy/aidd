import type { RecipeStepDefinition } from '../../api/types.ts';

import { StepOverviewCard } from './StepOverviewCard.tsx';

export function RecipePipelineView({ steps }: { steps: RecipeStepDefinition[] }) {
	return (
		<div>
			{steps.map((step, index) => (
				<StepOverviewCard
					isLast={index === steps.length - 1}
					key={step.id}
					step={step}
					stepNumber={index + 1}
				/>
			))}
		</div>
	);
}
