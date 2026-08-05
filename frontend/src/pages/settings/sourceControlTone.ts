import type { SettingsSourceControlStatus, SettingsToolStatus } from '../../api/types.ts';
import type { Tone } from '../../lib/tones.ts';

/** Tone for the install half of a row's health, before authentication is considered. */
export const installedTone: Record<SettingsToolStatus, Tone> = {
	available: 'emerald',
	configured: 'emerald',
	missing: 'amber',
	unavailable: 'red',
};

/** `authStatus` is prose from the provider CLI; only an affirmative opening counts as signed in. */
export function isAuthenticated(authStatus: null | string): boolean {
	if (!authStatus) return true;
	return /^authenticated\b/i.test(authStatus.trim());
}

/**
 * One tone per row, from the worse of installed and authenticated.
 *
 * The badge used to report installation alone, so Azure DevOps showed an emerald `available`
 * directly beside "Not authenticated: ERROR: Please run 'az login'" — the badge contradicting the
 * sentence next to it.
 */
export function sourceControlRowTone(item: SettingsSourceControlStatus): Tone {
	const installed = installedTone[item.status];
	if (installed === 'emerald' && !isAuthenticated(item.authStatus)) return 'amber';
	return installed;
}
