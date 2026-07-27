import type {
	DirectiveRunLaunchRequest,
	RunCommitsResponse,
	RunFileChanges,
	RunLaunchRequest,
	RunOutputResponse,
	RunRecord,
} from './types.ts';

import { apiGet, apiSend } from './client.ts';

export interface RunsPage {
	nextCursor: null | string;
	runs: RunRecord[];
}

export interface ListRunsParams {
	cursor?: string;
	limit?: number;
	projectPath?: string;
	/** Exclude pipeline-owned runs — the unified Runs feed shows those only inside
	 * their session's expanded step rows. */
	topLevel?: boolean;
}

type RawRunCommitsResponse = {
	fileChanges?: RunFileChanges;
} & Omit<RunCommitsResponse, 'fileChanges'>;

function unavailableRunFileChanges(): RunFileChanges {
	return {
		created: [],
		edited: [],
		source: 'unavailable',
		truncated: false,
	};
}

export function normalizeRunCommitsResponse(response: RawRunCommitsResponse): RunCommitsResponse {
	return {
		...response,
		fileChanges: response.fileChanges ?? unavailableRunFileChanges(),
	};
}

export async function getRunCommits(id: string, signal?: AbortSignal): Promise<RunCommitsResponse> {
	const response = await apiGet<RawRunCommitsResponse>(`/api/v1/runs/${id}/commits`, { signal });
	return normalizeRunCommitsResponse(response);
}

export async function getRunOutput(id: string, signal?: AbortSignal): Promise<RunOutputResponse> {
	return apiGet<RunOutputResponse>(`/api/v1/runs/${id}/output`, { signal });
}

// Single-record fetch for runs missing from the loaded list — e.g. a pipeline-owned run
// deep-linked via ?run= while the unified feed lists topLevel runs only.
export async function getRun(id: string, signal?: AbortSignal): Promise<null | RunRecord> {
	const response = await apiGet<{ run: null | RunRecord }>(`/api/v1/runs/${id}`, { signal });
	return response.run;
}

export async function continueRun(id: string): Promise<RunRecord> {
	const response = await apiSend<{ run: RunRecord }>(`/api/v1/runs/${id}/continue`, 'POST');
	return response.run;
}

export async function killRun(id: string): Promise<void> {
	await apiSend<{ ok: true }>(`/api/v1/runs/${id}/kill`, 'POST');
}

export async function launchDirectiveRun(request: DirectiveRunLaunchRequest): Promise<RunRecord> {
	const response = await apiSend<{ run: RunRecord }>('/api/v1/runs/directive', 'POST', request);
	return response.run;
}

export async function launchRun(request: RunLaunchRequest): Promise<RunRecord> {
	const response = await apiSend<{ run: RunRecord }>('/api/v1/runs', 'POST', request);
	return response.run;
}

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

export async function stopRun(id: string): Promise<void> {
	await apiSend<{ ok: true }>(`/api/v1/runs/${id}/stop`, 'POST');
}
