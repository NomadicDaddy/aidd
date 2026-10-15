import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';

export interface ForceStopConfirmProps {
	isPending: boolean;
	onClose: () => void;
	onConfirm: () => void;
	open: boolean;
}

/**
 * The Runs page's confirm for a force stop. A graceful Stop needs none, but once a session is
 * stopping the same Stop button kills its run, and a second click on a stop that has not shown
 * its effect yet is the natural thing to do; this dialog stands between that click and the kill.
 * The wording matches the session report page's force dialog.
 */
export function ForceStopConfirm(props: ForceStopConfirmProps) {
	return (
		<ConfirmDialog
			confirmLabel="Force stop session"
			description="The active run is killed now instead of at its iteration boundary. Work it has not committed may be lost."
			destructive
			isPending={props.isPending}
			onClose={props.onClose}
			onConfirm={props.onConfirm}
			open={props.open}
			title="Force stop pipeline session?"
		/>
	);
}
