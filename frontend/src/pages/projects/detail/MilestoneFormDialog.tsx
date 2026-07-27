import { useState } from 'react';

import type { ProjectMilestone } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Dialog, DialogPanel } from '../../../components/ui/dialog.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { fieldLabelClass, textareaClass } from '../../../lib/formStyles.ts';

export interface MilestoneFormValues {
	description: string;
	name: string;
	position: number;
}

/**
 * Create and edit share one form because they collect the same three fields. `milestone` being
 * null is what distinguishes them: a create defaults to the end of the list, an edit seeds from the
 * milestone's current standing and submits only what actually changed.
 */
export function MilestoneFormDialog({
	busy,
	count,
	existingNames,
	milestone,
	onClose,
	onSubmit,
	open,
}: {
	busy: boolean;
	count: number;
	existingNames: string[];
	milestone: null | ProjectMilestone;
	onClose: () => void;
	onSubmit: (values: MilestoneFormValues) => void;
	open: boolean;
}) {
	const editing = milestone !== null;
	const initialPosition = milestone
		? Math.max(1, existingNames.indexOf(milestone.name) + 1)
		: count + 1;
	const [name, setName] = useState(milestone?.name ?? '');
	const [description, setDescription] = useState(milestone?.description ?? '');
	const [position, setPosition] = useState(String(initialPosition));

	const trimmedName = name.trim();
	const parsedPosition = Number.parseInt(position, 10);
	const positionValid =
		Number.isInteger(parsedPosition) &&
		parsedPosition >= 1 &&
		parsedPosition <= (editing ? count : count + 1);
	const collides = existingNames.some(
		(existing) => existing !== milestone?.name && existing === trimmedName,
	);
	const invalidName = trimmedName.length === 0 || /[\\/]/.test(trimmedName);
	const disabled = busy || invalidName || collides || !positionValid;

	function submit(): void {
		if (disabled) return;
		onSubmit({ description: description.trim(), name: trimmedName, position: parsedPosition });
	}

	return (
		<Dialog
			aria-labelledby="milestone-form-title"
			initialFocus="first"
			onClose={onClose}
			open={open}>
			<DialogPanel className="w-full max-w-lg space-y-4">
				<h2 className="text-base font-semibold text-foreground" id="milestone-form-title">
					{editing ? `Edit ${milestone.name}` : 'New milestone'}
				</h2>
				<label className="block space-y-1">
					<span className={fieldLabelClass}>Name</span>
					<Input
						aria-label="Milestone name"
						className="w-full"
						onChange={(event) => setName(event.target.value)}
						value={name}
					/>
				</label>
				{collides ? (
					<p className="text-xs text-red-600 dark:text-red-400">
						A milestone named {trimmedName} already exists.
					</p>
				) : null}
				<label className="block space-y-1">
					<span className={fieldLabelClass}>Description</span>
					<textarea
						aria-label="Milestone description"
						className={textareaClass}
						onChange={(event) => setDescription(event.target.value)}
						value={description}
					/>
				</label>
				<label className="block space-y-1">
					<span className={fieldLabelClass}>
						Position (1 = first milestone the coding gate walks)
					</span>
					<Input
						aria-label="Milestone position"
						className="w-24"
						inputMode="numeric"
						onChange={(event) => setPosition(event.target.value)}
						value={position}
					/>
				</label>
				<p className="text-xs text-muted-foreground">
					Reordering can push features later to keep them behind their dependencies. You
					will see exactly what moves before anything is written.
				</p>
				<div className="flex justify-end gap-2">
					<Button disabled={busy} onClick={onClose}>
						Cancel
					</Button>
					<Button disabled={disabled} onClick={submit} variant="primary">
						{editing ? 'Preview changes' : 'Create'}
					</Button>
				</div>
			</DialogPanel>
		</Dialog>
	);
}
