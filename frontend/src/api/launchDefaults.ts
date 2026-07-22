import type { RunMode } from './types.ts';
import type { LaunchDefaults } from './types/launchDefaults.ts';

import { apiGet } from './client.ts';

export async function getLaunchDefaults(
	projectDir?: string,
	mode?: RunMode
): Promise<LaunchDefaults> {
	const params = new URLSearchParams();
	if (projectDir) params.set('projectDir', projectDir);
	if (mode) params.set('mode', mode);
	const query = params.toString();
	return await apiGet<LaunchDefaults>(`/api/v1/launch-defaults${query ? `?${query}` : ''}`);
}
