import type { PipelineSessionRecord, PipelineSessionReport } from './types.ts';

import { apiGet, apiSend } from './client.ts';

export interface PipelineSessionsPage {
	nextCursor: null | string;
	sessions: PipelineSessionRecord[];
}

export interface ListPipelineSessionsParams {
	cursor?: string;
	limit?: number;
}

export async function getPipelineSessionReport(id: string): Promise<PipelineSessionReport> {
	const response = await apiGet<{ report: PipelineSessionReport }>(
		`/api/v1/pipeline-sessions/${id}/report`
	);
	return response.report;
}

export async function listPipelineSessions(
	params: ListPipelineSessionsParams = {}
): Promise<PipelineSessionsPage> {
	const search = new URLSearchParams();
	if (params.cursor) search.set('cursor', params.cursor);
	if (params.limit !== undefined) search.set('limit', String(params.limit));
	const query = search.toString();
	return apiGet<PipelineSessionsPage>(`/api/v1/pipeline-sessions${query ? `?${query}` : ''}`);
}

export async function stopPipelineSession(id: string): Promise<void> {
	await apiSend<{ ok: true }>(`/api/v1/pipeline-sessions/${id}/stop`, 'POST');
}
