import { useId, useState } from 'react';

import { Button } from '../../../../components/ui/button.tsx';
import { Dialog, DialogPanel } from '../../../../components/ui/dialog.tsx';
import { textareaClass } from '../../../../lib/formStyles.ts';

// Mirrors commitMessageMaxLength in backend/src/services/git/workingTreeCommit.ts, so the textarea
// stops at the same point the route schema would reject.
const commitMessageMaxLength = 2_000;

export function CommitMessageDialog({
	description,
	isPending,
	onClose,
	onSubmit,
	open,
	title,
}: {
	description: string;
	isPending: boolean;
	onClose: () => void;
	onSubmit: (message: string) => void;
	open: boolean;
	title: string;
}) {
	const [message, setMessage] = useState('');
	const titleId = useId();
	const descriptionId = useId();
	const trimmed = message.trim();

	function close() {
		setMessage('');
		onClose();
	}

	function submit() {
		if (trimmed.length === 0 || isPending) return;
		onSubmit(trimmed);
		setMessage('');
	}

	return (
		<Dialog
			aria-describedby={descriptionId}
			aria-labelledby={titleId}
			initialFocus="first"
			onClose={close}
			open={open}>
			<DialogPanel className="w-full max-w-lg p-5">
				<h2 className="text-sm font-semibold text-foreground" id={titleId}>
					{title}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground" id={descriptionId}>
					{description}
				</p>
				<textarea
					aria-label="Commit message"
					className={`${textareaClass} mt-4`}
					disabled={isPending}
					maxLength={commitMessageMaxLength}
					onChange={(event) => setMessage(event.target.value)}
					// Ctrl/Cmd+Enter commits, matching every other commit box the user meets.
					onKeyDown={(event) => {
						if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
							event.preventDefault();
							submit();
						}
					}}
					placeholder="Describe the change…"
					value={message}
				/>
				<div className="mt-4 flex justify-end gap-2">
					<Button disabled={isPending} onClick={close} variant="ghost">
						Cancel
					</Button>
					<Button
						disabled={isPending || trimmed.length === 0}
						onClick={submit}
						variant="primary">
						{isPending ? 'Committing…' : 'Commit'}
					</Button>
				</div>
			</DialogPanel>
		</Dialog>
	);
}
