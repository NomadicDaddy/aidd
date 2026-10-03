import { type ReactElement, useState } from 'react';

import { AlertDialog } from '../components/ui/alert-dialog.tsx';

interface GuardedCloseOptions {
	/** Whether closing now would throw away something the operator typed. */
	readonly dirty: boolean;
	readonly onClose: () => void;
	/** What would be lost, said in the confirmation: "the commit message", "your edits". */
	readonly what: string;
}

/**
 * The close a form dialog gives to Escape, the backdrop and its X: immediate when nothing has been
 * typed, and a "discard?" confirmation when something has.
 *
 * Four form dialogs passed `onClose` straight to the shared Dialog, so a stray Escape or a click
 * just outside the panel threw away a half-written commit message, milestone or spec with no
 * trace. DirectiveLaunchModal already guarded this by hand; this is that guard, once, so a form
 * dialog opts in with one line rather than by copying a state machine.
 *
 * An explicit Cancel button stays a direct close. Pressing Cancel is the operator saying discard;
 * Escape and the backdrop are the ones that happen by accident.
 */
export function useGuardedClose({ dirty, onClose, what }: GuardedCloseOptions): {
	discardDialog: ReactElement;
	requestClose: () => void;
} {
	const [asking, setAsking] = useState(false);
	return {
		discardDialog: (
			<AlertDialog
				cancelLabel="Keep editing"
				confirmLabel="Discard"
				description={`${what[0]?.toUpperCase() ?? ''}${what.slice(1)} has not been saved and will be lost.`}
				destructive
				onClose={() => setAsking(false)}
				onConfirm={() => {
					setAsking(false);
					onClose();
				}}
				open={asking}
				title="Discard unsaved changes?"
			/>
		),
		requestClose: () => {
			if (dirty) setAsking(true);
			else onClose();
		},
	};
}
