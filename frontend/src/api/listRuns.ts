import type { RunRecord } from './types.ts';

import { apiGet } from './client.ts';

export interface RunsPage {
	nextCursor: null | string;
	runs: RunRecord[];
}

interface ListRunsParams {
	cursor?: string;
	limit?: number;
	projectPath?: string;
	/** Exclude pipeline-owned runs, shown inside their session's expanded step rows. */
	topLevel?: boolean;
}

/** The shell's active count needs the list endpoint without run mutation/output operations. */
export async function listRuns(
	params: ListRunsParams = {},
	signal?: AbortSignal,
): Promise<RunsPage> {
	const search = new URLSearchParams();
	if (params.projectPath) search.set('projectPath', params.projectPath);
	if (params.cursor) search.set('cursor', params.cursor);
	if (params.limit !== undefined) search.set('limit', String(params.limit));
	if (params.topLevel) search.set('topLevel', 'true');
	const query = search.toString();
	return apiGet<RunsPage>(`/api/v1/runs${query ? `?${query}` : ''}`, { signal });
}
