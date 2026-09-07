import { AlertDialog } from '../ui/alert-dialog.tsx';

interface ConfirmDialogProps {
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
 * App-level confirmation dialog. Re-expressed on top of the canonical
 * {@link AlertDialog} primitive; preserves the prior ARIA semantics, focus
 * trap, app-shell inert behavior, and destructive-flow focus defaults.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
	return <AlertDialog {...props} />;
}
