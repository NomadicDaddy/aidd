/* eslint-disable react-hooks/set-state-in-effect */
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { probeAuth } from '../../api/client.ts';
import { useAuthTokenStore } from '../../stores/authTokenStore.ts';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { FieldRow } from '../ui/field.tsx';
import { SecretInput } from '../ui/secret-input.tsx';
import { authTokenDialogReadiness } from './authTokenDialogReadiness.ts';
import { CredentialBadge } from './CredentialBadge.tsx';

const TITLE_ID = 'access-token-dialog-title';
const DESCRIPTION_ID = 'access-token-dialog-description';

export function AuthTokenDialog() {
	const clearToken = useAuthTokenStore((state) => state.clearToken);
	const closePrompt = useAuthTokenStore((state) => state.closePrompt);
	const open = useAuthTokenStore((state) => state.promptOpen);
	const setToken = useAuthTokenStore((state) => state.setToken);
	const token = useAuthTokenStore((state) => state.token);
	const [draft, setDraft] = useState(token);
	const [verifying, setVerifying] = useState(false);
	const readiness = authTokenDialogReadiness(draft, token, verifying);

	useEffect(() => {
		if (!open) return;
		setDraft(token);
	}, [open, token]);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (readiness.saveDisabled) return;
		const trimmed = draft.trim();
		setToken(trimmed);
		setVerifying(true);
		const result = await probeAuth();
		setVerifying(false);
		// A 401 already reopened the prompt via reportUnauthorized; keep it open here too.
		if (result === 'unauthorized') {
			toast.error('Token rejected — check the configured value.');
			return;
		}
		closePrompt();
		toast.success(
			result === 'authorized'
				? 'Access token saved'
				: 'Access token saved — could not verify (server unreachable)',
		);
	}

	function clear() {
		if (readiness.clearDisabled) return;
		clearToken();
		setDraft('');
		toast.success('Access token cleared');
	}

	return (
		<Dialog
			aria-describedby={DESCRIPTION_ID}
			aria-labelledby={TITLE_ID}
			initialFocus="first"
			onClose={closePrompt}
			open={open}>
			<DialogPanel className="w-full max-w-md">
				{/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
				<form className="space-y-5 p-5" onSubmit={submit}>
					<div>
						<h2 className="text-base font-semibold text-foreground" id={TITLE_ID}>
							Access token
						</h2>
						<p className="mt-1 text-sm text-muted-foreground" id={DESCRIPTION_ID}>
							This value is stored in this browser only.
						</p>
					</div>
					<FieldRow
						hint={
							<>
								<CredentialBadge
									configured={token.length > 0}
									context="web-store"
								/>
								<span>
									Configure this token in Settings &gt; Control Panel &gt; Network
									Access. Saving replaces the value kept by this browser.
								</span>
							</>
						}
						label="Access token">
						<SecretInput
							autoComplete="off"
							disabled={verifying}
							onChange={(event) => setDraft(event.target.value)}
							placeholder="Paste token"
							secretName="access token"
							value={draft}
						/>
					</FieldRow>
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
						<Button disabled={readiness.clearDisabled} onClick={clear} variant="danger">
							<Trash2 className="h-4 w-4" />
							Clear
						</Button>
						<div className="flex justify-end gap-2">
							<Button disabled={verifying} onClick={closePrompt} variant="secondary">
								Cancel
							</Button>
							<Button
								disabled={readiness.saveDisabled}
								type="submit"
								variant="primary">
								{verifying ? 'Verifying…' : 'Save token'}
							</Button>
						</div>
					</div>
				</form>
			</DialogPanel>
		</Dialog>
	);
}
