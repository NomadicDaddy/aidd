/* eslint-disable @typescript-eslint/no-floating-promises */
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { RecipeDefinition } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useProjects } from '../../hooks/useProjects.ts';
import { useRecipes } from '../../hooks/useRecipes.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { autoParameters } from './recipe-parameters.ts';

export function RecipeLaunchPanel({
	onClose,
	recipe,
}: {
	onClose: () => void;
	recipe: RecipeDefinition;
}) {
	const navigate = useNavigate();
	const recipes = useRecipes();
	const projects = useProjects();
	const [projectDir, setProjectDir] = useState('');
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [parameters, setParameters] = useState<Record<string, string>>(() => {
		const defaults: Record<string, string> = {};
		for (const param of recipe.parameters) {
			if (autoParameters.has(param.name)) continue;
			if (param.defaultValue !== undefined) defaults[param.name] = param.defaultValue;
		}
		return defaults;
	});

	const userParams = recipe.parameters.filter((p) => !autoParameters.has(p.name));
	const allAuto = recipe.parameters.every((p) => autoParameters.has(p.name));

	function launch(): void {
		if (!projectDir) {
			toast.error('Select a project before launching');
			return;
		}
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'recipes.launch',
			source: 'RecipeLaunchPanel',
			summary: {
				parameterKeys: Object.keys(parameters),
				projectSelected: projectDir.length > 0,
				recipeId: recipe.id,
			},
			target: '/api/v1/recipes/:id/launch',
		});
		recipes.launchRecipe.mutate(
			{ id: recipe.id, launchTarget, parameters, projectDir },
			{
				onError: (error) => {
					toast.error('Launch failed', {
						description:
							error instanceof Error ? error.message : 'Unknown launch error.',
					});
				},
				onSuccess: (session) => {
					toast.success('Pipeline session started');
					// Land in the unified Runs feed with the new session selected and expanded;
					// the per-session report stays a click away from there.
					navigate(`/runs?pipeline=${encodeURIComponent(session.id)}`);
				},
			},
		);
	}

	return (
		<Card className="flex flex-col gap-4" variant="panel">
			{/* The same header as the Recipes-list quick launch, through the same component: two
			    copies of one panel drifting apart is what put a hand-rolled `h2` in both. */}
			<CardHeader
				action={
					<Button aria-label="Close launch panel" onClick={onClose} variant="ghost">
						<X className="h-4 w-4" />
					</Button>
				}
				className="mb-0"
				description={`${recipe.steps.length} ordered step${
					recipe.steps.length === 1 ? '' : 's'
				} will run in the selected project.`}
				title={`Launch ${recipe.name}`}
			/>

			<div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
				<FieldRow label="Project">
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => {
							traceDataMovement({
								category: 'event',
								layer: 'ui',
								operation: 'recipes.project.select',
								source: 'RecipeLaunchPanel',
								summary: {
									projectSelected: event.target.value.length > 0,
									recipeId: recipe.id,
								},
							});
							setProjectDir(event.target.value);
						}}
						value={projectDir}>
						<option value="">Select target project</option>
						{(projects.data?.projects ?? []).map((project) => (
							<option key={project.id} value={project.path}>
								{project.name}
							</option>
						))}
					</select>
				</FieldRow>
				{userParams.map((param) => (
					<FieldRow key={param.name} label={param.name}>
						<Input
							onChange={(event) =>
								setParameters((current) => ({
									...current,
									[param.name]: event.target.value,
								}))
							}
							placeholder={param.description ?? param.name}
							value={parameters[param.name] ?? ''}
						/>
					</FieldRow>
				))}
				{allAuto && (
					<div className="flex items-end">
						<p className="text-sm text-muted-foreground">
							Project parameters are filled from the selected launch target.
						</p>
					</div>
				)}
			</div>

			<LaunchTargetControl
				onChange={setLaunchTarget}
				projectDir={projectDir}
				value={launchTarget}
			/>

			<Button
				disabled={recipes.launchRecipe.isPending || !projectDir}
				onClick={launch}
				variant="primary">
				<Send className="h-4 w-4" />
				Start Session
			</Button>
		</Card>
	);
}
