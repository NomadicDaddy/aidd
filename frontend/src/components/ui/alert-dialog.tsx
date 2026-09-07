import { useId } from 'react';

import { Button } from './button.tsx';
import { Dialog, DialogPanel } from './dialog.tsx';

interface AlertDialogProps {
	cancelLabel?: string;
	cautious?: boolean;
	confirmLabel?: string;
	description?: string | undefined;
	destructive?: boolean;
	isPending?: boolean;
	onClose: () => void;
	onConfirm: () => void;
	open: boolean;
	title: string;
}

/**
 * Canonical confirmation dialog primitive. Renders an `alertdialog` over the
 * shared {@link Dialog} (focus trap, Escape/backdrop close, app-shell inert,
 * focus restoration) with a title, optional description, and a cancel/confirm
 * footer. Destructive flows place initial focus on Cancel to avoid an
 * accidental Enter-confirm.
 */
export function AlertDialog({
	cancelLabel = 'Cancel',
	cautious = false,
	confirmLabel,
	description,
	destructive = false,
	isPending = false,
	onClose,
	onConfirm,
	open,
	title,
}: AlertDialogProps) {
	const titleId = useId();
	const descriptionId = useId();
	const resolvedConfirmLabel = confirmLabel ?? (destructive ? 'Delete' : 'Confirm');

	return (
		<Dialog
			aria-describedby={description ? descriptionId : undefined}
			aria-labelledby={titleId}
			initialFocus={destructive || cautious ? 'first' : 'last'}
			onClose={onClose}
			open={open}
			role="alertdialog">
			<DialogPanel className="w-full max-w-md p-5">
				<h2 className="text-base font-semibold text-foreground" id={titleId}>
					{title}
				</h2>
				{description && (
					<p className="mt-2 text-sm text-muted-foreground" id={descriptionId}>
						{description}
					</p>
				)}
				<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button
						className="w-full sm:w-auto"
						disabled={isPending}
						onClick={onClose}
						variant="secondary">
						{cancelLabel}
					</Button>
					<Button
						className="w-full sm:w-auto"
						disabled={isPending}
						onClick={onConfirm}
						variant={destructive ? 'danger' : cautious ? 'secondary' : 'primary'}>
						{isPending ? 'Working…' : resolvedConfirmLabel}
					</Button>
				</div>
			</DialogPanel>
		</Dialog>
	);
}
