import type { WebConfigSettings } from './types.ts';

import { apiGet } from './client.ts';

/**
 * Reads the web config.
 *
 * Split out of `settings.ts` for the same reason as `projectNames.ts`: the sidebar reads one flag
 * off this response on every page, and that module carries the update payload, application-root
 * validation and tool-status polling that the shell has no use for.
 */
export async function getSettingsConfig(): Promise<WebConfigSettings> {
	const response = await apiGet<{ config: WebConfigSettings }>('/api/v1/settings/config');
	return response.config;
}
