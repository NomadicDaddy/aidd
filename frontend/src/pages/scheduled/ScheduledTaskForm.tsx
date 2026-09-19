import type { ScheduledTaskUpdate } from 'aidd-shared/contracts/scheduled-tasks';

import { type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';

import type { ScheduleIssue } from './scheduleBuilder.ts';
import type { ScheduledSaveTarget } from './scheduledSaveReadiness.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useScheduledTasks } from '../../hooks/useScheduledTasks.ts';
import { buildSchedule, scheduleIssue } from './scheduleBuilder.ts';
import { useScheduledDraft } from './scheduledDraftContext.ts';
import { ScheduledFormActions } from './ScheduledFormActions.tsx';
import { scheduledFormTwoColumnMeasureClass } from './scheduledFormMeasure.ts';
import { ScheduledFormSection } from './ScheduledFormSection.tsx';
import { scheduledSaveReadiness } from './scheduledSaveReadiness.ts';
import {
	ScheduledFixedScopeSection,
	ScheduledScopeAndSafetySections,
} from './ScheduledScopeSafetySections.tsx';
import { ScheduledFixedTarget, ScheduledTargetFields } from './ScheduledTargetFields.tsx';
import { useTargetRecipe } from './scheduledTargetRecipe.ts';
import { ScheduleFields } from './ScheduleFields.tsx';
import { buildScheduledTarget } from './targetBuilder.ts';
import { useScheduleFeedback } from './useScheduleFeedback.ts';

export function ScheduledTaskForm({
	onCancel,
	onSaved,
}: {
	onCancel: () => void;
	onSaved: () => void;
}) {
	// The draft lives on the route, not here: the page shell guards this form's exits and needs the
	// same answer to "is anything unsaved?" that the form does.
	const { dirty, draft, patch, scheduleDirty, scheduleTouched, task, touchSchedule } =
		useScheduledDraft();
	const {
		applyChanges,
		args,
		builder,
		confirmed,
		cron,
		launchTarget,
		name,
		parameters,
		projects,
		projectScope,
		prompt,
		runAt,
		targetId,
		targetType,
		time,
		timezone,
		weekdays,
	} = draft;
	const scheduled = useScheduledTasks();
	// Built-in tasks expose only their name and cadence; the backend preserves target and scope.
	const system = (task?.systemKey ?? null) !== null;
	const schedule = () => buildSchedule({ builder, cron, runAt, time, timezone, weekdays });
	// Structured builders hide cron, so name missing fields before building the schedule.
	const issue = scheduleIssue({ builder, cron, runAt, time, weekdays });
	const feedback = useScheduleFeedback({
		builder,
		preview: (value) => scheduled.preview.mutateAsync(value),
		schedule,
	});
	// An unfilled field outranks a backend complaint about the expression it would have produced.
	const scheduleError: null | ScheduleIssue =
		issue ?? (feedback.cronError ? { field: 'cron', message: feedback.cronError } : null);
	const visibleScheduleError = scheduleTouched || feedback.cronError ? scheduleError : null;
	const projectSelectionMissing = projectScope === 'explicit' && projects.length === 0;
	// A built-in task's target is the Director cycle, whatever the target fields the form hides
	// would have said. While the catalog is still loading a recipe reads as not metadata-only; the
	// target select is empty until it arrives, so the gate has already blocked on a missing target.
	const targetRecipe = useTargetRecipe(targetType, targetId);
	const target: ScheduledSaveTarget = system
		? { type: 'director' }
		: targetType === 'recipe'
			? { metadataOnly: targetRecipe?.metadataOnly === true, type: 'recipe' }
			: targetType === 'directive'
				? { prompt, type: 'directive' }
				: { type: targetType };
	const previewDisabled =
		(!system && targetType !== 'directive' && !targetId) ||
		!name ||
		feedback.pending ||
		(scheduleTouched && scheduleError !== null);
	const saveReadiness = scheduledSaveReadiness({
		applyChanges,
		confirmed,
		issue: scheduleError,
		name,
		pending: scheduled.create.isPending || scheduled.update.isPending,
		projectScope,
		projectSelectionMissing,
		system,
		target,
		targetId,
	});
	const pristineEdit = Boolean(task) && !dirty && !saveReadiness.blocked;
	const saveDisabled = saveReadiness.blocked || pristineEdit;
	// The parameter editor updates one key of a map it does not own, so it needs the functional
	// form; `patch` takes it and applies it against the draft the provider holds.
	const setParameters: Dispatch<SetStateAction<Record<string, string>>> = (update) =>
		patch((current) => ({
			parameters: typeof update === 'function' ? update(current.parameters) : update,
		}));
	function save(): void {
		let input: ScheduledTaskUpdate;
		try {
			input = {
				confirmUnattendedMutation: confirmed,
				name,
				projects: projectScope === 'explicit' ? projects : [],
				projectScope,
				schedule: schedule(),
				...(system
					? {}
					: {
							target: buildScheduledTarget({
								applyChanges,
								args,
								launchTarget,
								parameters,
								prompt,
								targetId,
								targetType,
							}),
						}),
			};
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Enter a valid date and time.');
			return;
		}
		const onError = (error: Error) => toast.error(error.message || 'Save failed');
		const onSuccess = () => {
			toast.success(task ? 'Scheduled task updated' : 'Scheduled task created');
			onSaved();
		};
		if (task) scheduled.update.mutate({ id: task.id, input }, { onError, onSuccess });
		// Only a built-in-task edit may omit the target; a new task always has one here.
		else if (input.target)
			scheduled.create.mutate({ ...input, target: input.target }, { onError, onSuccess });
	}
	function previewSchedule(): void {
		touchSchedule();
		if (scheduleError === null) feedback.request();
	}
	return (
		<Card className="space-y-3" variant="panel">
			<CardHeader
				badge={system ? <Badge tone="violet">System</Badge> : undefined}
				identifier={system ? task?.id : undefined}
				title={task ? `Edit ${task.name}` : 'New task'}
			/>
			<ScheduledFormSection title="Task">
				<div className={`grid gap-3 sm:grid-cols-2 ${scheduledFormTwoColumnMeasureClass}`}>
					{system ? (
						<>
							<FieldRow label="Name" required>
								<Input
									onChange={(event) => patch({ name: event.target.value })}
									placeholder="Nightly hygiene sweep"
									value={name}
								/>
							</FieldRow>
							<ScheduledFixedTarget />
						</>
					) : (
						<ScheduledTargetFields
							args={args}
							nameField={
								<FieldRow label="Name" required>
									<Input
										onChange={(event) => patch({ name: event.target.value })}
										placeholder="Nightly hygiene sweep"
										value={name}
									/>
								</FieldRow>
							}
							onArgsChange={(value) => patch({ args: value })}
							onPromptChange={(value) => patch({ prompt: value })}
							onTargetIdChange={(value) => patch({ targetId: value })}
							onTargetTypeChange={(nextType) =>
								patch({
									applyChanges: nextType === 'recipe',
									parameters: {},
									targetId: '',
									targetType: nextType,
								})
							}
							parameters={parameters}
							prompt={prompt}
							setParameters={setParameters}
							targetId={targetId}
							targetType={targetType}
						/>
					)}
				</div>
			</ScheduledFormSection>
			<ScheduledFormSection title="Schedule">
				<ScheduleFields
					issue={visibleScheduleError}
					onCronBlur={feedback.validateCron}
					onPreview={previewSchedule}
					onScheduleChange={feedback.clear}
					onValidate={touchSchedule}
					preview={feedback.times}
					previewDisabled={previewDisabled}
					{...(system && !scheduleDirty ? { nextRunAt: task?.nextRunAt ?? null } : {})}
				/>
			</ScheduledFormSection>
			{system ? <ScheduledFixedScopeSection /> : <ScheduledScopeAndSafetySections />}
			<ScheduledFormActions
				editing={Boolean(task)}
				onCancel={onCancel}
				onSave={save}
				saveDisabled={saveDisabled}
				saveDisabledReason={pristineEdit ? 'No changes to save.' : saveReadiness.reason}
			/>
		</Card>
	);
}
