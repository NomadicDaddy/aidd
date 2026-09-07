import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { FieldCheckbox, FieldRow } from '../../components/ui/field.tsx';
import { compactFieldMeasureClass } from '../../lib/typography.ts';
import { useScheduledDraft } from './scheduledDraftContext.ts';
import { scheduledFormTwoColumnMeasureClass } from './scheduledFormMeasure.ts';

export function ScheduledSafetyFields({
	noProject,
	projectDir,
}: {
	noProject: boolean;
	projectDir?: string;
}) {
	const { draft, patch } = useScheduledDraft();
	return (
		<div
			className={`grid items-start gap-3 sm:grid-cols-2 ${scheduledFormTwoColumnMeasureClass}`}>
			<FieldRow group label="Launch target">
				<LaunchTargetControl
					customBadge
					defaultScope="per-project"
					onChange={(launchTarget) => patch({ launchTarget })}
					{...(projectDir ? { projectDir } : {})}
					size="default"
					value={draft.launchTarget}
				/>
			</FieldRow>
			<FieldCheckbox
				checked={draft.applyChanges}
				description={
					draft.targetType === 'recipe'
						? 'Recipes can contain mutating steps, so scheduled recipe targets always require unattended-change consent.'
						: undefined
				}
				disabled={draft.targetType === 'recipe'}
				label="Allow changes without an operator present"
				onChange={(event) => patch({ applyChanges: event.target.checked })}
			/>
			{draft.applyChanges ? (
				<FieldCheckbox
					aria-required="true"
					checked={draft.confirmed}
					className={compactFieldMeasureClass}
					label={
						noProject
							? 'I understand this target may change files anywhere under the applications root, unattended.'
							: 'I understand this target may change project files unattended.'
					}
					onChange={(event) => patch({ confirmed: event.target.checked })}
					tone="amber"
				/>
			) : null}
		</div>
	);
}
