import type { TelegramChannelSettings } from '../../api/types/settings.ts';
import type { CredentialPendingAction } from '../../components/shared/credentialBadgeTypes.ts';

export function updateTelegramTokenDraft(
	telegram: TelegramChannelSettings,
	value: string,
): TelegramChannelSettings {
	const next = { ...telegram };
	const trimmed = value.trim();
	if (trimmed) next.botToken = trimmed;
	else delete next.botToken;
	return next;
}

export function clearTelegramTokenDraft(
	telegram: TelegramChannelSettings,
): TelegramChannelSettings {
	return { ...telegram, botToken: null };
}

export function telegramTokenPendingAction(
	telegram: TelegramChannelSettings,
): CredentialPendingAction | undefined {
	if (telegram.botToken === null) return 'clear';
	if (!telegram.botToken) return undefined;
	return telegram.botTokenConfigured ? 'replace' : 'set';
}
