import type { RecipeDefinition } from '../../api/types.ts';

import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { isRequiredRecipeParameter } from './recipe-launch.ts';
import { autoParameters } from './recipe-parameters.ts';

export function RecipeLaunchFields({
	parameters,
	recipe,
	setParameters,
}: {
	parameters: Record<string, string>;
	recipe: RecipeDefinition;
	setParameters: (update: (current: Record<string, string>) => Record<string, string>) => void;
}) {
	const userParameters = recipe.parameters.filter(
		(parameter) => !autoParameters.has(parameter.name),
	);
	const filledParameters = recipe.parameters.filter((parameter) =>
		autoParameters.has(parameter.name),
	);

	if (userParameters.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				{recipe.parameters.length === 0
					? 'This recipe has no configurable parameters.'
					: 'Project parameters are filled from the selected project.'}
			</p>
		);
	}

	return (
		<>
			{userParameters.map((parameter) => {
				const required = isRequiredRecipeParameter(parameter);
				const description =
					parameter.description?.trim() ??
					`Value passed to the ${parameter.name} recipe parameter.`;
				const descriptionSentence = /[.!?]$/u.test(description)
					? description
					: `${description}.`;
				return (
					<FieldRow
						hint={`${descriptionSentence}${required ? ' Required to start this recipe.' : ''}`}
						key={parameter.name}
						label={
							<span className="font-mono tracking-normal normal-case">
								{parameter.name}
							</span>
						}
						required={required}>
						<Input
							onChange={(event) =>
								setParameters((current) => ({
									...current,
									[parameter.name]: event.target.value,
								}))
							}
							placeholder={`Enter ${parameter.name}`}
							value={parameters[parameter.name] ?? ''}
						/>
					</FieldRow>
				);
			})}
			{filledParameters.length > 0 ? (
				<p className="col-span-full text-xs text-muted-foreground">
					<span className="font-mono text-foreground">
						{filledParameters.map((parameter) => parameter.name).join(', ')}
					</span>{' '}
					{filledParameters.length === 1 ? 'is' : 'are'} filled from the selected project.
				</p>
			) : null}
		</>
	);
}
