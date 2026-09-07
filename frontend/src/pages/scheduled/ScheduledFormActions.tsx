import { useId } from 'react';

import { Button } from '../../components/ui/button.tsx';

export function ScheduledFormActions({
	editing,
	onCancel,
	onSave,
	saveDisabled,
	saveDisabledReason,
}: {
	editing: boolean;
	onCancel: () => void;
	onSave: () => void;
	saveDisabled: boolean;
	saveDisabledReason: null | string;
}) {
	const saveReasonId = useId();
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4">
			<div className="flex flex-wrap gap-2">
				<Button onClick={onCancel} variant="secondary">
					Cancel
				</Button>
				<Button
					aria-describedby={saveDisabledReason ? saveReasonId : undefined}
					disabled={saveDisabled}
					onClick={onSave}
					variant="primary">
					{editing ? 'Update task' : 'Save task'}
				</Button>
			</div>
			{saveDisabledReason ? (
				<p
					aria-live="polite"
					className="min-w-0 text-sm text-muted-foreground"
					id={saveReasonId}
					role="status">
					{saveDisabledReason}
				</p>
			) : null}
		</div>
	);
}
