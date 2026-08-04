import { useState } from 'react';

import type { WebConfigSettings } from '../../api/types.ts';

import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ListEditor } from './ListEditor.tsx';

function isLoopbackHostname(hostname: string): boolean {
	const normalized = hostname.trim().toLowerCase();
	return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

export function NetworkAccessSection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	const [confirmRemoteOpen, setConfirmRemoteOpen] = useState(false);

	function requestAllowRemote(checked: boolean) {
		if (!checked) {
			setField('allowRemote', false);
			return;
		}
		setConfirmRemoteOpen(true);
	}

	function confirmAllowRemote() {
		setField('allowRemote', true);
		if (isLoopbackHostname(form.hostname)) {
			setField('hostname', '0.0.0.0');
		}
		setConfirmRemoteOpen(false);
	}

	return (
		<>
			<Card className="grid gap-4 p-3 lg:grid-cols-2">
				<div className="space-y-4">
					<label className="flex items-start gap-2 rounded-md border border-border px-3 py-2">
						<input
							checked={form.allowRemote}
							className="mt-0.5"
							onChange={(event) => requestAllowRemote(event.target.checked)}
							type="checkbox"
						/>
						<span className="text-sm text-foreground">
							<span className="font-medium text-foreground">
								Allow local network access
							</span>
							<span className="mt-1 block text-xs text-muted-foreground">
								{form.allowRemote
									? 'The next restart can expose the control panel beyond this machine.'
									: 'Limited to this machine.'}
							</span>
						</span>
					</label>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="space-y-1">
							<span className="text-xs font-medium text-muted-foreground uppercase">
								Hostname
							</span>
							<Input
								onChange={(event) => setField('hostname', event.target.value)}
								placeholder="127.0.0.1"
								value={form.hostname}
							/>
						</label>
						<label className="space-y-1">
							<span className="text-xs font-medium text-muted-foreground uppercase">
								Port
							</span>
							<Input
								max={65535}
								min={1}
								onChange={(event) =>
									setField(
										'port',
										event.target.value.trim() ? Number(event.target.value) : 0,
									)
								}
								type="number"
								value={form.port === 0 ? '' : String(form.port)}
							/>
						</label>
					</div>
					<p className="text-xs text-muted-foreground">
						Listener changes take effect after restarting aidd-web.
						{form.authTokenConfigured
							? ' A remote bearer token is configured.'
							: ' A remote bearer token will be generated when network access is saved.'}
					</p>
				</div>
				<ListEditor
					items={form.allowedOrigins}
					label="Allowed Origins"
					onChange={(items) => setField('allowedOrigins', items)}
					placeholder="http://192.0.2.10:3210"
				/>
			</Card>
			<ConfirmDialog
				confirmLabel="Enable network access"
				description={
					form.authTokenConfigured
						? 'Saving these settings will allow the next restart to expose the control panel beyond this machine. Remote callers must provide the configured bearer token.'
						: 'Saving these settings will generate a remote bearer token and allow the next restart to expose the control panel beyond this machine.'
				}
				onClose={() => setConfirmRemoteOpen(false)}
				onConfirm={confirmAllowRemote}
				open={confirmRemoteOpen}
				title="Enable network access?"
			/>
		</>
	);
}
