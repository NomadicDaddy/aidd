/* eslint-disable @typescript-eslint/no-floating-promises */
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { RecipeDefinition } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useProjectNames } from '../../hooks/useProjects.ts';
import { useRecipes } from '../../hooks/useRecipes.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { recipeLaunchBlocker, resolveRecipeLaunchProject } from './recipe-launch.ts';
import { autoParameters } from './recipe-parameters.ts';
import { RecipeLaunchForm } from './RecipeLaunchForm.tsx';

export function RecipeLaunchPanel({
	onClose,
	recipe,
}: {
	onClose: () => void;
	recipe: RecipeDefinition;
}) {
	const navigate = useNavigate();
	const recipes = useRecipes();
	const projects = useProjectNames();
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
	const headingId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const projectOptions = projects.data?.projects ?? [];
	const targetProject = resolveRecipeLaunchProject(projectOptions, projectDir);
	const launchBlockedBy = recipeLaunchBlocker(recipe, parameters, targetProject?.path ?? '');
	const stepLabel = `${recipe.steps.length} ordered step${recipe.steps.length === 1 ? '' : 's'}`;
	const compact =
		recipe.parameters.filter((parameter) => !autoParameters.has(parameter.name)).length <= 1;

	useEffect(() => {
		panelRef.current?.focus({ preventScroll: true });
	}, []);

	function launch(): void {
		if (!targetProject) {
			toast.error('Choose a project before starting this recipe.');
			return;
		}
		if (launchBlockedBy) {
			toast.error(launchBlockedBy);
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
			{ id: recipe.id, launchTarget, parameters, projectDir: targetProject.path },
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
		<div
			aria-labelledby={headingId}
			className="@container rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/80"
			onKeyDown={(event) => {
				if (
					event.key !== 'Escape' ||
					!(event.target instanceof Node) ||
					!event.currentTarget.contains(event.target)
				)
					return;
				event.preventDefault();
				onClose();
			}}
			ref={panelRef}
			role="region"
			tabIndex={-1}>
			<Card className="flex flex-col gap-4" variant="panel">
				{/* The same header as the Recipes-list quick launch, through the same component: two
			    copies of one panel drifting apart is what put a hand-rolled `h2` in both. */}
				<CardHeader
					action={
						<Button
							aria-label={`Close launch panel for ${recipe.name}`}
							onClick={onClose}
							variant="ghost">
							<X className="h-4 w-4" />
						</Button>
					}
					className="mb-0"
					description={
						targetProject
							? `${stepLabel} will run in ${targetProject.name}.`
							: `${stepLabel} ${recipe.steps.length === 1 ? 'needs' : 'need'} a target project before launch.`
					}
					id={headingId}
					title={`Launch ${recipe.name}`}
				/>

				<RecipeLaunchForm
					compact={compact}
					launchBlockedBy={launchBlockedBy}
					launchPending={recipes.launchRecipe.isPending}
					launchTarget={launchTarget}
					layout="inline"
					onClose={onClose}
					onLaunch={launch}
					onLaunchTargetChange={setLaunchTarget}
					onProjectChange={(projectPath) => {
						traceDataMovement({
							category: 'event',
							layer: 'ui',
							operation: 'recipes.project.select',
							source: 'RecipeLaunchPanel',
							summary: {
								projectSelected: projectPath.length > 0,
								recipeId: recipe.id,
							},
						});
						setProjectDir(projectPath);
					}}
					parameters={parameters}
					projectDir={targetProject?.path ?? ''}
					projects={projectOptions}
					recipe={recipe}
					setParameters={setParameters}
				/>
			</Card>
		</div>
	);
}
