import { useState } from 'react';

import type { WebConfigSettings } from '../../api/types.ts';

import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow, FormGrid } from '../../components/ui/field.tsx';
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
			<FormGrid>
				<Card className="grid gap-4 @min-[45rem]:grid-cols-2">
					<CardHeader
						className="@min-[45rem]:col-span-2"
						level="section"
						title="Network Access"
					/>
					<div className="space-y-4">
						<FieldCheckbox
							checked={form.allowRemote}
							description={
								form.allowRemote
									? 'Allows access beyond this machine. Saving a change to this setting restarts the panel.'
									: 'Limited to this machine.'
							}
							label="Allow local network access"
							onChange={(event) => requestAllowRemote(event.target.checked)}
							tone={form.allowRemote ? 'amber' : 'neutral'}
						/>
						<FormGrid className="gap-4 @min-[32rem]:grid-cols-2">
							<FieldRow
								hint="Saving a new hostname restarts aidd-web and reloads this page."
								label="Hostname">
								<Input
									onChange={(event) => setField('hostname', event.target.value)}
									placeholder="127.0.0.1"
									value={form.hostname}
								/>
							</FieldRow>
							<FieldRow
								hint="Saving a new port restarts aidd-web and reloads this page."
								label="Port">
								<Input
									max={65535}
									min={1}
									onChange={(event) =>
										setField(
											'port',
											event.target.value.trim()
												? Number(event.target.value)
												: 0,
										)
									}
									type="number"
									value={form.port === 0 ? '' : String(form.port)}
								/>
							</FieldRow>
						</FormGrid>
						<p className={`text-xs text-muted-foreground ${proseMeasureClass}`}>
							{form.authTokenConfigured
								? ' An access token is configured.'
								: 'An access token will be generated when network access is saved.'}
						</p>
					</div>
					<ListEditor
						items={form.allowedOrigins}
						label="Allowed Origins"
						onChange={(items) => setField('allowedOrigins', items)}
						placeholder="http://192.0.2.10:3210"
					/>
				</Card>
			</FormGrid>
			<ConfirmDialog
				confirmLabel="Enable network access"
				description={
					form.authTokenConfigured
						? 'Saving restarts the panel with network access enabled. Remote API callers must send the configured access token as Authorization: Bearer <token>. Use a trusted network.'
						: 'Saving generates an access token and restarts the panel with network access enabled. Remote API callers need that token. Use a trusted network.'
				}
				onClose={() => setConfirmRemoteOpen(false)}
				onConfirm={confirmAllowRemote}
				open={confirmRemoteOpen}
				title="Enable network access?"
			/>
		</>
	);
}
