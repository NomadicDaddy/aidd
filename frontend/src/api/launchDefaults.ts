import type { BackendName, RunMode } from './types.ts';
import type { LaunchDefaults } from './types/launchDefaults.ts';

import { apiGet } from './client.ts';

// A named query builder in the trailing template span is what check:api-types reads as
// "the bare path plus a query"; an inline conditional there reads as a path parameter.
function buildQuery(projectDir?: string, mode?: RunMode, backend?: BackendName): string {
	const params = new URLSearchParams();
	if (backend) params.set('backend', backend);
	if (projectDir) params.set('projectDir', projectDir);
	if (mode) params.set('mode', mode);
	const query = params.toString();
	return query ? `?${query}` : '';
}

export async function getLaunchDefaults(
	projectDir?: string,
	mode?: RunMode,
	backend?: BackendName,
): Promise<LaunchDefaults> {
	return await apiGet<LaunchDefaults>(
		`/api/v1/launch-defaults${buildQuery(projectDir, mode, backend)}`,
	);
}
