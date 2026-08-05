import { default as Send } from 'lucide-react/dist/esm/icons/send';

import type { RecipeDefinition } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { autoParameters } from './recipe-parameters.ts';

export function RecipeQuickLaunchPanel({
	launchDisabled,
	launchPending,
	onClose,
	onLaunch,
	parameters,
	recipe,
	setParameters,
}: {
	launchDisabled: boolean;
	launchPending: boolean;
	onClose: () => void;
	onLaunch: () => void;
	parameters: Record<string, string>;
	recipe: RecipeDefinition;
	setParameters: (update: (current: Record<string, string>) => Record<string, string>) => void;
}) {
	return (
		<Card className="space-y-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h2 className="text-lg font-semibold text-foreground">Launch {recipe.name}</h2>
					<p className="text-sm text-muted-foreground">
						{recipe.steps.length} ordered steps will run in the selected project.
					</p>
				</div>
				<Button onClick={onClose} variant="ghost">
					Close
				</Button>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{recipe.parameters
					.filter((parameter) => !autoParameters.has(parameter.name))
					.map((parameter) => (
						<FieldRow key={parameter.name} label={parameter.name}>
							<Input
								onChange={(event) =>
									setParameters((current) => ({
										...current,
										[parameter.name]: event.target.value,
									}))
								}
								placeholder={parameter.description ?? parameter.name}
								value={parameters[parameter.name] ?? ''}
							/>
						</FieldRow>
					))}
				{recipe.parameters.every((parameter) => autoParameters.has(parameter.name)) && (
					<div className="text-sm text-muted-foreground">
						Project parameters are filled from the selected launch target.
					</div>
				)}
			</div>
			<Button disabled={launchPending || launchDisabled} onClick={onLaunch} variant="primary">
				<Send className="h-4 w-4" />
				Start Session
			</Button>
		</Card>
	);
}
