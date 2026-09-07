import type { DiaryEntriesPage, DiaryTimelinePage } from './types.ts';

import { apiGet } from './client.ts';

export interface ListDiaryParams {
	cursor?: string;
	limit?: number;
	projectPath?: string;
}

function buildQuery(params: ListDiaryParams): string {
	const search = new URLSearchParams();
	if (params.projectPath) search.set('projectPath', params.projectPath);
	if (params.cursor) search.set('cursor', params.cursor);
	if (params.limit !== undefined) search.set('limit', String(params.limit));
	const query = search.toString();
	return query ? `?${query}` : '';
}

export async function listDiaryEntries(
	params: ListDiaryParams = {},
	signal?: AbortSignal,
): Promise<DiaryEntriesPage> {
	return apiGet<DiaryEntriesPage>(`/api/v1/diary/entries${buildQuery(params)}`, { signal });
}

export async function listDiaryTimeline(
	params: ListDiaryParams = {},
	signal?: AbortSignal,
): Promise<DiaryTimelinePage> {
	return apiGet<DiaryTimelinePage>(`/api/v1/diary/timeline${buildQuery(params)}`, { signal });
}
