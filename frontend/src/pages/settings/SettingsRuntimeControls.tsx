import { default as Power } from 'lucide-react/dist/esm/icons/power';
import { default as RotateCw } from 'lucide-react/dist/esm/icons/rotate-cw';
import { useState } from 'react';
import { toast } from 'sonner';

import type { RuntimeAction } from './settingsRuntime.ts';

import { requestWebRestart, requestWebShutdown } from '../../api/admin.ts';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';

export function SettingsRuntimeControls({
	dirty,
	runtimePending,
	setRuntimePending,
}: {
	dirty: boolean;
	runtimePending: null | RuntimeAction;
	setRuntimePending: (action: null | RuntimeAction) => void;
}) {
	const [runtimeDialog, setRuntimeDialog] = useState<null | RuntimeAction>(null);

	function openRuntimeDialog(action: RuntimeAction) {
		if (dirty) {
			toast.warning('Save or discard settings changes before changing runtime state.');
			return;
		}
		setRuntimeDialog(action);
	}

	async function requestRuntimeAction(action: RuntimeAction) {
		setRuntimePending(action);
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: action === 'restart' ? 'admin.restart' : 'admin.shutdown',
			source: 'SettingsPage',
			target: action === 'restart' ? '/api/v1/admin/restart' : '/api/v1/admin/shutdown',
		});
		try {
			if (action === 'restart') {
				await requestWebRestart();
				toast.success('Restart requested');
			} else {
				await requestWebShutdown();
				toast.success('Shutdown requested');
			}
			setRuntimeDialog(null);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: `Could not ${action === 'restart' ? 'restart' : 'shut down'} the control panel`,
			);
		} finally {
			setRuntimePending(null);
		}
	}

	return (
		<>
			{/* The one tinted card on the surface, and the only place raw teal-* ladder values were
			    used instead of the accent tokens. The danger-variant Shutdown button carries the
			    weight; the tint only sets the zone apart. */}
			<Card className="flex flex-col gap-4 border-border bg-accent-muted">
				<CardHeader
					action={
						<div className="flex flex-wrap gap-2">
							<Button
								disabled={runtimePending !== null}
								onClick={() => openRuntimeDialog('restart')}
								variant="secondary">
								<RotateCw className="h-4 w-4" />
								Restart
							</Button>
							<Button
								disabled={runtimePending !== null}
								onClick={() => openRuntimeDialog('shutdown')}
								variant="danger">
								<Power className="h-4 w-4" />
								Shutdown
							</Button>
						</div>
					}
					actionLayout="stacked"
					className="mb-0"
					description="Manage the running aidd web backend."
					title="Control Panel Runtime"
				/>
			</Card>

			<ConfirmDialog
				confirmLabel="Restart"
				description="The web backend will close its current listener and start again on the configured port."
				isPending={runtimePending === 'restart'}
				onClose={() => setRuntimeDialog(null)}
				onConfirm={() => void requestRuntimeAction('restart')}
				open={runtimeDialog === 'restart'}
				title="Restart control panel?"
			/>
			<ConfirmDialog
				confirmLabel="Shut down"
				description="The web backend will close its listener and leave managed aidd runs detached."
				destructive
				isPending={runtimePending === 'shutdown'}
				onClose={() => setRuntimeDialog(null)}
				onConfirm={() => void requestRuntimeAction('shutdown')}
				open={runtimeDialog === 'shutdown'}
				title="Shut down control panel?"
			/>
		</>
	);
}
