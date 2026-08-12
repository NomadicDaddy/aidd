import { AlertDialog } from '../../../components/ui/alert-dialog.tsx';

interface CatalogSelectionDialogProps {
	onCancel: () => void;
	onConfirm: () => void;
	pendingAudit: null | string;
}

export function CatalogSelectionDialog({
	onCancel,
	onConfirm,
	pendingAudit,
}: CatalogSelectionDialogProps) {
	return (
		<AlertDialog
			confirmLabel="Discard changes"
			description="You have unsaved changes to this audit definition. Choosing another audit will discard them."
			destructive
			onClose={onCancel}
			onConfirm={onConfirm}
			open={pendingAudit !== null}
			title={`Choose ${pendingAudit ?? 'another audit'}?`}
		/>
	);
}
