import { Badge } from '../../components/ui/badge.tsx';

/**
 * "A credential is stored" — one component, one label pair, one tone pair.
 *
 * Settings said it three ways on one surface: an emerald `Key configured` Badge on each provider
 * row, plain muted 14px text reading `API key configured` in the Direct AI card, and a coloured
 * emerald sentence reading `A bot token is configured.` under BOT TOKEN. Three typographic weights
 * for one boolean, so the reader had to learn the fact three times rather than recognise it.
 *
 * The label pair says nothing about *which* credential because the field it sits with already
 * does — `Bot Token`, the provider name, `Direct AI`. That is what lets one pair serve an API key,
 * a bot token and a provider key alike.
 */
export function CredentialBadge({ configured }: { configured: boolean }) {
	return (
		<Badge tone={configured ? 'emerald' : 'neutral'}>
			{configured ? 'Configured' : 'Not set'}
		</Badge>
	);
}
