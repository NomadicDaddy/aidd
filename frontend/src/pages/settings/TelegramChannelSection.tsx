import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { WebConfigSettings } from '../../api/types.ts';

import { Button, IconButton } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { fieldLabelClass } from '../../lib/formStyles.ts';

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
		<Card className="space-y-3 p-3">
			<div className={fieldLabelClass}>
				<Send className="mr-1 inline h-4 w-4" />
				Telegram Channel
			</div>
			<p className="text-xs text-muted-foreground">
				Telegram bot integration for bridged mode. The bot token is write-only — the current
				configured state is shown without revealing the stored value.
			</p>

			<FieldRow label="Bot Token">
				<Input
					onChange={(event) => setBotToken(event.target.value)}
					placeholder={
						telegram.botTokenConfigured ? '•••••••• (configured)' : 'Enter bot token'
					}
					type="password"
					value={telegram.botToken ?? ''}
				/>
				{telegram.botTokenConfigured && !telegram.botToken && (
					<span className="text-xs text-emerald-600">A bot token is configured.</span>
				)}
			</FieldRow>

			<div className="space-y-2">
				<span className="text-xs text-muted-foreground">Allowed Chat IDs</span>
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
