import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { WebConfigSettings } from '../../api/types.ts';

import { Button, IconButton } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { fieldLabelClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';

const BOT_TOKEN_HINT_ID = 'settings-telegram-bot-token-hint';

function parseChatId(value: string): number | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return undefined;
	return parsed;
}

export function TelegramChannelSection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	const telegram = form.telegram;
	const configuredHint = telegram.botTokenConfigured && !telegram.botToken;

	function setBotToken(value: string): void {
		setField('telegram', {
			...telegram,
			botToken: value.trim() || null,
		});
	}

	function setChatId(index: number, value: string): void {
		const next = [...telegram.allowedChatIds];
		const parsed = parseChatId(value);
		if (parsed !== undefined) {
			next[index] = parsed;
		}
		setField('telegram', { ...telegram, allowedChatIds: next });
	}

	function addChatId(): void {
		setField('telegram', { ...telegram, allowedChatIds: [...telegram.allowedChatIds, 0] });
	}

	function removeChatId(index: number): void {
		setField('telegram', {
			...telegram,
			allowedChatIds: telegram.allowedChatIds.filter((_, i) => i !== index),
		});
	}

	return (
		<Card className="space-y-3">
			{/* The section title takes the h2 its peer cards use; fieldLabelClass belongs on the
			    field labels below, which had been rendered as plain sentence-case spans. */}
			<h2 className="text-sm font-semibold text-foreground">
				<Send aria-hidden="true" className="mr-1 inline h-4 w-4" />
				Telegram Channel
			</h2>
			<p className="text-xs text-muted-foreground">
				Telegram bot integration for bridged mode. The bot token is write-only — the current
				configured state is shown without revealing the stored value.
			</p>

			<div className="space-y-1">
				<FieldRow label="Bot Token">
					<Input
						aria-describedby={configuredHint ? BOT_TOKEN_HINT_ID : undefined}
						onChange={(event) => setBotToken(event.target.value)}
						placeholder={
							telegram.botTokenConfigured
								? '•••••••• (configured)'
								: 'Enter bot token'
						}
						type="password"
						value={telegram.botToken ?? ''}
					/>
				</FieldRow>
				{/* Sibling, not child: inside the label this status line became part of the
				    control's accessible name ('Bot Token A bot token is configured.'). */}
				{configuredHint ? (
					<p className={`text-xs ${toneText.emerald}`} id={BOT_TOKEN_HINT_ID}>
						A bot token is configured.
					</p>
				) : null}
			</div>

			<div className="space-y-2">
				<span className={fieldLabelClass}>Allowed Chat IDs</span>
				{telegram.allowedChatIds.map((chatId, index) => (
					<div className="flex items-center gap-2" key={index}>
						<Input
							aria-label={`Allowed chat ID ${index + 1}`}
							onChange={(event) => setChatId(index, event.target.value)}
							placeholder="Numeric chat ID"
							value={String(chatId)}
						/>
						<IconButton
							ariaLabel={`Remove chat ID ${index + 1}`}
							className="shrink-0"
							onClick={() => removeChatId(index)}
							variant="ghost">
							<Trash2 className="h-4 w-4" />
						</IconButton>
					</div>
				))}
				<Button onClick={addChatId} variant="secondary">
					<Plus className="h-4 w-4" />
					Add Chat ID
				</Button>
			</div>
		</Card>
	);
}
