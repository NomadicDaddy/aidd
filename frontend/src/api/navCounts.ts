import type { NavCounts } from 'aidd-shared/contracts/nav-counts';

import { apiGet } from './client.ts';

/**
 * The sidebar's destination counts, in one request.
 *
 * Its own module for the same reason as `projectNames.ts`: the shell calls this on every page, so
 * anything it can reach is critical-path code, and the four catalog modules behind these numbers
 * carry their create, import, launch and reload surfaces with them.
 */
export async function getNavCounts(signal?: AbortSignal): Promise<NavCounts> {
	return await apiGet<NavCounts>('/api/v1/nav-counts', { signal });
}
