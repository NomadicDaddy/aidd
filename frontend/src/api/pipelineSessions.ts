import type {
	PipelineSessionRecord,
	PipelineSessionReport,
	PipelineSessionStatus,
} from './types.ts';

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
		`/api/v1/pipeline-sessions/${id}/report`,
	);
	return response.report;
}

export async function listPipelineSessions(
	params: ListPipelineSessionsParams = {},
): Promise<PipelineSessionsPage> {
	const search = new URLSearchParams();
	if (params.cursor) search.set('cursor', params.cursor);
	if (params.limit !== undefined) search.set('limit', String(params.limit));
	const query = search.toString();
	return apiGet<PipelineSessionsPage>(`/api/v1/pipeline-sessions${query ? `?${query}` : ''}`);
}

/**
 * Stops a session. The first Stop lets its run end at its iteration boundary and answers
 * 'stopping' while it works; `force`, offered while stopping, kills the run tree.
 * @returns The session's status after the request.
 */
export async function stopPipelineSession(input: {
	force: boolean;
	id: string;
}): Promise<PipelineSessionStatus> {
	const response = await apiSend<{ ok: true; status: PipelineSessionStatus }>(
		`/api/v1/pipeline-sessions/${input.id}/stop`,
		'POST',
		{ force: input.force },
	);
	return response.status;
}
