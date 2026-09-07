import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { useLaunchDefaults } from '../../hooks/useLaunchDefaults.ts';
import { FieldRow } from '../ui/field.tsx';
import { describeTargetSource } from './directive-launch-target.ts';
import { LaunchTargetControl } from './LaunchTargetControl.tsx';

interface DirectiveTargetFieldProps {
	onChange: (value: LaunchTargetValue) => void;
	projectDir: string;
	value: LaunchTargetValue;
}

/**
 * The launch-target field, including where its defaults came from.
 *
 * The defaults query lives here rather than in the modal because nothing else in the modal asks
 * for them, and the answer is only meaningful next to the control it explains. Without a project
 * there is no target to resolve, so the control is replaced by the reason rather than rendered
 * empty and inert.
 * @param props.onChange Receives the edited target.
 * @param props.projectDir The selected project, or the empty string before one is chosen.
 * @param props.value The target currently in force.
 * @returns The launch-target field.
 */
export function DirectiveTargetField({ onChange, projectDir, value }: DirectiveTargetFieldProps) {
	const launchDefaults = useLaunchDefaults(projectDir || undefined, 'directive');
	const source = describeTargetSource(
		launchDefaults.isLoading,
		launchDefaults.data?.projectConfigApplied,
	);
	return (
		<FieldRow
			group
			hint={projectDir ? source : 'Select a project to resolve launch defaults.'}
			label="Launch target">
			{projectDir ? (
				<LaunchTargetControl
					mode="directive"
					onChange={onChange}
					projectDir={projectDir}
					size="default"
					value={value}
				/>
			) : (
				<div className="flex min-h-9 items-center rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground">
					Select a project to resolve the launch target.
				</div>
			)}
		</FieldRow>
	);
}
