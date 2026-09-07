import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { useId } from 'react';
import { Link } from 'react-router';

import type { RecipeDefinition } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';
import type { RecipeLaunchProject } from './recipe-launch.ts';

import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { DialogBody, DialogFooter } from '../../components/ui/dialog.tsx';
import { cn } from '../../lib/cn.ts';
import { toneText } from '../../lib/tones.ts';
import { RecipeLaunchFields } from './RecipeLaunchFields.tsx';
import { RecipeProjectField } from './RecipeProjectField.tsx';

interface RecipeLaunchFormProps {
	compact: boolean;
	launchBlockedBy: null | string;
	launchPending: boolean;
	launchTarget: LaunchTargetValue;
	layout: 'dialog' | 'inline';
	onClose: () => void;
	onLaunch: () => void;
	onLaunchTargetChange: (value: LaunchTargetValue) => void;
	onProjectChange: (projectDir: string) => void;
	parameters: Record<string, string>;
	projectDir: string;
	projects: RecipeLaunchProject[];
	recipe: RecipeDefinition;
	setParameters: (update: (current: Record<string, string>) => Record<string, string>) => void;
}

/**
 * The shared operator form for both ways into recipe launch.
 *
 * The surrounding Card or Dialog owns the heading and width. This component owns every field,
 * breakpoint, readiness message, and action, so entering from a recipe row or its detail page
 * cannot silently change what is configured or how the operator backs out.
 */
export function RecipeLaunchForm({
	compact,
	launchBlockedBy,
	launchPending,
	launchTarget,
	layout,
	onClose,
	onLaunch,
	onLaunchTargetChange,
	onProjectChange,
	parameters,
	projectDir,
	projects,
	recipe,
	setParameters,
}: RecipeLaunchFormProps) {
	const readinessId = useId();
	const fields = (
		<>
			<div className={cn('grid gap-3', !compact && '@min-[32rem]:grid-cols-2')}>
				<RecipeProjectField
					onChange={onProjectChange}
					projectDir={projectDir}
					projects={projects}
				/>
				<RecipeLaunchFields
					parameters={parameters}
					recipe={recipe}
					setParameters={setParameters}
				/>
			</div>
			<LaunchTargetControl
				label="Launch target"
				onChange={onLaunchTargetChange}
				projectDir={projectDir}
				size="default"
				value={launchTarget}
			/>
		</>
	);
	const actions = (
		<>
			<Link
				className={buttonClassName('secondary')}
				to={`/scheduled?type=recipe&id=${encodeURIComponent(recipe.id)}`}>
				Schedule
			</Link>
			<div className="grid gap-2 sm:justify-items-end">
				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
					<Button onClick={onClose} variant="secondary">
						Cancel
					</Button>
					<Button
						aria-describedby={launchBlockedBy ? readinessId : undefined}
						disabled={launchPending || launchBlockedBy !== null}
						onClick={onLaunch}
						variant="primary">
						<Send className="h-4 w-4" />
						Start Session
					</Button>
				</div>
				{launchBlockedBy ? (
					<p className={`text-xs ${toneText.amber}`} id={readinessId}>
						{launchBlockedBy}
					</p>
				) : null}
			</div>
		</>
	);

	if (layout === 'dialog') {
		return (
			<>
				<DialogBody className="@container grid gap-4 px-5 py-5">{fields}</DialogBody>
				<DialogFooter className="flex-col gap-3 border-t border-border p-5 sm:flex-row sm:items-start sm:justify-between">
					{actions}
				</DialogFooter>
			</>
		);
	}

	return (
		<div className={cn('grid gap-4', compact && 'max-w-lg')}>
			<div className="@container grid gap-4">{fields}</div>
			<div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between">
				{actions}
			</div>
		</div>
	);
}
