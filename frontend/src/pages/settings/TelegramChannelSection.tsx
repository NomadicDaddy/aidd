import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { useState } from 'react';

import type { WebConfigSettings } from '../../api/types.ts';

import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { CredentialBadge } from '../../components/shared/CredentialBadge.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { SecretInput } from '../../components/ui/secret-input.tsx';
import { ListEditor } from './ListEditor.tsx';
import {
	clearTelegramTokenDraft,
	telegramTokenPendingAction,
	updateTelegramTokenDraft,
} from './telegramTokenDraft.ts';

function parseChatId(value: string): null | number {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Number(trimmed);
	if (!Number.isSafeInteger(parsed)) return null;
	return parsed;
}

function chatIdError(value: string): null | string {
	return parseChatId(value) === null
		? 'Enter a whole-number chat ID or remove this entry.'
		: null;
}

export function TelegramChannelSection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	const [clearDialogOpen, setClearDialogOpen] = useState(false);
	const telegram = form.telegram;
	const pendingAction = telegramTokenPendingAction(telegram);
	const showCredentialState = telegram.botTokenConfigured || pendingAction !== undefined;
	const effectiveConfigured =
		pendingAction !== 'clear' && (telegram.botTokenConfigured || pendingAction !== undefined);

	function setBotToken(value: string): void {
		setField('telegram', updateTelegramTokenDraft(telegram, value));
	}

	function confirmTokenClear(): void {
		setField('telegram', clearTelegramTokenDraft(telegram));
		setClearDialogOpen(false);
	}

	function keepStoredToken(): void {
		setField('telegram', updateTelegramTokenDraft(telegram, ''));
	}

	function setChatIds(values: string[]): void {
		setField('telegram', {
			...telegram,
			allowedChatIds: values.map((value) => parseChatId(value) ?? Number.NaN),
		});
	}

	return (
		<Card className="flex flex-col gap-3">
			{/* The section title takes the h2 its peer cards use; fieldLabelClass belongs on the
			    field labels below, which had been rendered as plain sentence-case spans. */}
			{/* The sentence goes through the header's own description slot, not beside it: the slot
			    carries the reading measure, and a hand-rolled sibling renders the same 12px muted
			    line at whatever width the card happens to be. */}
			<CardHeader
				// The counterpart to the Read-only badge on SettingsStatusPanels: the badge slot
				// classifies the card, so the tab states its own taxonomy in one screenshot.
				badge={<Badge tone="neutral">Configurable</Badge>}
				className="mb-0"
				description="Telegram bot integration for bridged mode. The bot token is write-only — the current configured state is shown without revealing the stored value."
				icon={<Send className="h-4 w-4" />}
				title="Telegram Channel"
			/>

			<div className="space-y-1">
				<FieldRow
					className="max-w-[33.25rem]"
					hint={
						showCredentialState ? (
							<span aria-live="polite" className="inline-flex">
								<CredentialBadge
									configured={effectiveConfigured}
									pendingAction={pendingAction}
								/>
							</span>
						) : undefined
					}
					label="Bot Token">
					<SecretInput
						onChange={(event) => setBotToken(event.target.value)}
						placeholder={
							telegram.botTokenConfigured
								? 'Enter replacement token'
								: 'Enter bot token'
						}
						secretName="Telegram bot token"
						value={telegram.botToken ?? ''}
					/>
				</FieldRow>
				{telegram.botTokenConfigured && (
					<div className="flex flex-wrap items-center gap-2 pt-1">
						{pendingAction === 'clear' ? (
							<Button onClick={keepStoredToken} size="compact" variant="secondary">
								Keep stored token
							</Button>
						) : (
							<Button
								onClick={() => setClearDialogOpen(true)}
								size="compact"
								variant="secondary">
								Clear stored token
							</Button>
						)}
						<span className="text-xs text-muted-foreground">
							Changes take effect when you save Settings.
						</span>
					</div>
				)}
			</div>

			<ListEditor
				inputClassName="font-mono"
				items={telegram.allowedChatIds.map((chatId) =>
					Number.isSafeInteger(chatId) ? String(chatId) : '',
				)}
				label="Allowed Chat IDs"
				onChange={setChatIds}
				placeholder="Numeric chat ID"
				validateItem={chatIdError}
			/>

			<ConfirmDialog
				confirmLabel="Clear stored token"
				description="This stages the stored Telegram bot token for removal. The token remains configured until you save Settings."
				destructive
				onClose={() => setClearDialogOpen(false)}
				onConfirm={confirmTokenClear}
				open={clearDialogOpen}
				title="Clear the stored Telegram token?"
			/>
		</Card>
	);
}
