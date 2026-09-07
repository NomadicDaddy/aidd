import { type FormEvent, useId, useState } from 'react';

import type {
	FindingDismissalInput,
	FindingDismissalReason,
	ProjectFeature,
} from '../../../api/types.ts';

import { findingDismissalReasons } from '../../../api/types.ts';
import { Button } from '../../../components/ui/button.tsx';
import { Dialog, DialogPanel } from '../../../components/ui/dialog.tsx';
import { humanizeEnum } from '../../../lib/formatters.ts';
import { fieldLabelClass, selectClass, textareaClass } from '../../../lib/formStyles.ts';
import { featureDirectory } from './featuresUtils.ts';

export function FindingDismissalDialog({
	feature,
	isPending,
	onClose,
	onConfirm,
}: {
	feature: ProjectFeature;
	isPending: boolean;
	onClose: () => void;
	onConfirm: (input: FindingDismissalInput) => void;
}) {
	const titleId = useId();
	const descriptionId = useId();
	const reasonId = useId();
	const noteId = useId();
	const [reason, setReason] = useState<'' | FindingDismissalReason>('');
	const [note, setNote] = useState('');
	const featureId = featureDirectory(feature);

	function submit(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		if (!reason || isPending) return;
		onConfirm({
			...(note.trim() ? { note: note.trim() } : {}),
			reason,
		});
	}

	return (
		<Dialog
			aria-describedby={descriptionId}
			aria-labelledby={titleId}
			initialFocus="first"
			onClose={onClose}
			open
			role="alertdialog">
			<DialogPanel className="w-full max-w-md">
				<form className="space-y-4 p-5" onSubmit={submit}>
					<div>
						<h2 className="text-base font-semibold text-foreground" id={titleId}>
							Dismiss audit finding?
						</h2>
						<p className="mt-2 text-sm text-muted-foreground" id={descriptionId}>
							The reason for dismissing <span className="font-mono">{featureId}</span>{' '}
							will remain in the findings ledger after its feature directory is
							removed.
						</p>
					</div>
					<label className="block space-y-2" htmlFor={reasonId}>
						<span className={fieldLabelClass}>Reason</span>
						<select
							className={`${selectClass} w-full`}
							disabled={isPending}
							id={reasonId}
							onChange={(event) =>
								setReason(event.target.value as '' | FindingDismissalReason)
							}
							required
							value={reason}>
							<option value="">Select a reason</option>
							{findingDismissalReasons.map((value) => (
								<option key={value} value={value}>
									{humanizeEnum(value.replaceAll('-', '_'))}
								</option>
							))}
						</select>
					</label>
					<label className="block space-y-2" htmlFor={noteId}>
						<span className={fieldLabelClass}>Note (optional)</span>
						<textarea
							className={textareaClass}
							disabled={isPending}
							id={noteId}
							maxLength={5000}
							onChange={(event) => setNote(event.target.value)}
							placeholder="Evidence or rationale"
							value={note}
						/>
					</label>
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button disabled={isPending} onClick={onClose} variant="secondary">
							Cancel
						</Button>
						<Button disabled={!reason || isPending} type="submit" variant="danger">
							{isPending ? 'Dismissing…' : 'Dismiss finding'}
						</Button>
					</div>
				</form>
			</DialogPanel>
		</Dialog>
	);
}
