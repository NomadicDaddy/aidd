/* eslint-disable react-hooks/set-state-in-effect */
import { default as KeyRound } from 'lucide-react/dist/esm/icons/key-round';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { probeAuth } from '../../api/client.ts';
import { useAuthTokenStore } from '../../stores/authTokenStore.ts';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { Input } from '../ui/input.tsx';

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

	useEffect(() => {
		if (!open) return;
		setDraft(token);
	}, [open, token]);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmed = draft.trim();
		if (!trimmed) {
			toast.warning('Enter the configured access token.');
			return;
		}
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
				: 'Access token saved — could not verify (server unreachable)'
		);
	}

	function clear() {
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
					<div className="flex items-start gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-300">
							<KeyRound className="h-5 w-5" />
						</div>
						<div className="min-w-0">
							<h2 className="text-foreground text-base font-semibold" id={TITLE_ID}>
								Control panel access
							</h2>
							<p
								className="mt-1 text-sm text-neutral-600 dark:text-neutral-400"
								id={DESCRIPTION_ID}>
								Enter the configured web access token for this browser.
							</p>
						</div>
					</div>
					<label className="block space-y-2">
						<span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
							Access token
						</span>
						<Input
							autoComplete="off"
							disabled={verifying}
							onChange={(event) => setDraft(event.target.value)}
							placeholder="Paste token"
							type="password"
							value={draft}
						/>
					</label>
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
						<Button disabled={!token || verifying} onClick={clear} variant="ghost">
							<Trash2 className="h-4 w-4" />
							Clear
						</Button>
						<div className="flex justify-end gap-2">
							<Button disabled={verifying} onClick={closePrompt} variant="secondary">
								Cancel
							</Button>
							<Button disabled={verifying} type="submit" variant="primary">
								{verifying ? 'Verifying…' : 'Save Token'}
							</Button>
						</div>
					</div>
				</form>
			</DialogPanel>
		</Dialog>
	);
}
