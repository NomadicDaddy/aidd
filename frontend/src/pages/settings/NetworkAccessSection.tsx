import { useState } from 'react';

import type { WebConfigSettings } from '../../api/types.ts';

import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { proseMeasureClass } from '../../lib/typography.ts';
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
			{/* Titled, like the cards above and below it. Untitled, its strongest label was the
			    same 12px uppercase field label its own controls carry, so the section rhythm of the
			    tab broke: two h2-titled cards, then two that read as one continuous form. */}
			<Card className="grid gap-4 @min-[45rem]:grid-cols-2">
				<div className="space-y-4">
					<CardHeader level="section" title="Network Access" />
					<FieldCheckbox
						checked={form.allowRemote}
						description={
							form.allowRemote
								? 'The next restart can expose the control panel beyond this machine.'
								: 'Limited to this machine.'
						}
						label="Allow local network access"
						onChange={(event) => requestAllowRemote(event.target.checked)}
						tone={form.allowRemote ? 'amber' : 'neutral'}
					/>
					<div className="grid gap-4 @min-[32rem]:grid-cols-2">
						<FieldRow label="Hostname">
							<Input
								onChange={(event) => setField('hostname', event.target.value)}
								placeholder="127.0.0.1"
								value={form.hostname}
							/>
						</FieldRow>
						<FieldRow label="Port">
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
						</FieldRow>
					</div>
					<p className={`text-xs text-muted-foreground ${proseMeasureClass}`}>
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
