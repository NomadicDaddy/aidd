import type { ProjectNamesResponse } from './types.ts';

import { apiGet } from './client.ts';

/**
 * The lightweight project list: id, name, path, route id, and the spernakit template flag.
 *
 * It lives apart from `projects.ts` because the sidebar count calls it on every page, and that
 * module's create, import, move, maturity and report surface would ride onto the shell's critical
 * path behind it.
 */
export async function listProjectNames(signal?: AbortSignal): Promise<ProjectNamesResponse> {
	return await apiGet<ProjectNamesResponse>('/api/v1/projects/names', { signal });
}
