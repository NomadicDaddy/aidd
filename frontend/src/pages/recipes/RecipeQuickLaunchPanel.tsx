import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useId } from 'react';

import type { RecipeDefinition } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { Button } from '../../components/ui/button.tsx';
import { CardHeader } from '../../components/ui/card.tsx';
import { Dialog, DialogPanel } from '../../components/ui/dialog.tsx';
import { cn } from '../../lib/cn.ts';
import { type RecipeLaunchProject, resolveRecipeLaunchProject } from './recipe-launch.ts';
import { autoParameters } from './recipe-parameters.ts';
import { RecipeLaunchForm } from './RecipeLaunchForm.tsx';

export function RecipeQuickLaunchPanel({
	launchBlockedBy,
	launchPending,
	launchTarget,
	onClose,
	onLaunch,
	onLaunchTargetChange,
	panelId,
	parameters,
	projectDir,
	projects,
	recipe,
	setParameters,
	setProjectDir,
}: {
	launchBlockedBy: null | string;
	launchPending: boolean;
	launchTarget: LaunchTargetValue;
	onClose: () => void;
	onLaunch: () => void;
	onLaunchTargetChange: (value: LaunchTargetValue) => void;
	panelId: string;
	parameters: Record<string, string>;
	projectDir: string;
	projects: RecipeLaunchProject[];
	recipe: RecipeDefinition;
	setParameters: (update: (current: Record<string, string>) => Record<string, string>) => void;
	setProjectDir: (projectDir: string) => void;
}) {
	const headingId = useId();
	const targetProject = resolveRecipeLaunchProject(projects, projectDir);
	const stepLabel = `${recipe.steps.length} ordered step${recipe.steps.length === 1 ? '' : 's'}`;
	const userParameterCount = recipe.parameters.filter(
		(parameter) => !autoParameters.has(parameter.name),
	).length;
	const compact = userParameterCount <= 1;

	return (
		<Dialog aria-labelledby={headingId} initialFocus="container" onClose={onClose} open>
			<DialogPanel
				className={cn(
					'flex w-full flex-col overflow-hidden',
					compact ? 'max-w-lg' : 'max-w-2xl',
				)}
				id={panelId}>
				<CardHeader
					action={
						<Button
							aria-label={`Close launch panel for ${recipe.name}`}
							onClick={onClose}
							variant="ghost">
							<X className="h-4 w-4" />
						</Button>
					}
					className="mb-0 border-b border-border p-5"
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
					launchPending={launchPending}
					launchTarget={launchTarget}
					layout="dialog"
					onClose={onClose}
					onLaunch={onLaunch}
					onLaunchTargetChange={onLaunchTargetChange}
					onProjectChange={setProjectDir}
					parameters={parameters}
					projectDir={targetProject?.path ?? ''}
					projects={projects}
					recipe={recipe}
					setParameters={setParameters}
				/>
			</DialogPanel>
		</Dialog>
	);
}
