import type { WebConfigSettings } from '../../api/types.ts';

export type RestartAddressSettings = Pick<WebConfigSettings, 'hostname' | 'port'>;

function redirectHostname(currentHostname: string, configuredHostname: string): string {
	const hostname = configuredHostname.trim();
	if (!hostname || hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]') {
		return currentHostname || '127.0.0.1';
	}
	return hostname;
}

export function settingsRestartTargetChanged(
	current: RestartAddressSettings,
	next: RestartAddressSettings,
): boolean {
	return current.port !== next.port;
}

export function buildSettingsRestartUrl(currentHref: string, next: RestartAddressSettings): string {
	const url = new URL(currentHref);
	url.hostname = redirectHostname(url.hostname, next.hostname);
	url.port = String(next.port);
	url.pathname = '/settings';
	url.search = '';
	url.hash = '';
	return url.toString();
}
