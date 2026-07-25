import { default as Power } from 'lucide-react/dist/esm/icons/power';
import { default as RotateCw } from 'lucide-react/dist/esm/icons/rotate-cw';
import { useState } from 'react';
import { toast } from 'sonner';

import type { RuntimeAction } from './settingsRuntime.ts';

import { requestWebRestart, requestWebShutdown } from '../../api/admin.ts';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
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
			<Card className="flex flex-col gap-4 border-teal-200/80 bg-teal-50/60 dark:border-teal-950/70 dark:bg-teal-950/20">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h2 className="text-sm font-semibold text-teal-700 dark:text-teal-300">
							Control Panel Runtime
						</h2>
						<p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
							Manage the running aidd web backend.
						</p>
					</div>
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
				</div>
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
