import type { RecipeStepDefinition } from '../../api/types.ts';

import { StepOverviewCard } from './StepOverviewCard.tsx';

export function RecipePipelineView({ steps }: { steps: RecipeStepDefinition[] }) {
	const skillIntents = steps.flatMap((step) => {
		const value = step.stepType === 'skill' ? step.configJson.executionIntent : undefined;
		return typeof value === 'string' ? [value] : [];
	});
	const repeatedIntent =
		skillIntents.length > 1 && skillIntents.every((intent) => intent === skillIntents[0])
			? skillIntents[0]
			: undefined;
	return (
		<div>
			{steps.map((step, index) => (
				<StepOverviewCard
					isLast={index === steps.length - 1}
					key={step.id}
					step={step}
					stepNumber={index + 1}
					suppressIntent={repeatedIntent}
				/>
			))}
		</div>
	);
}
