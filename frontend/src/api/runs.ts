import type {
	DirectiveRunLaunchRequest,
	RunCommitsResponse,
	RunFileChanges,
	RunLaunchRequest,
	RunOutputResponse,
	RunOutputWindowRequest,
	RunRecord,
} from './types.ts';

import { apiGet, apiSend } from './client.ts';

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

export async function getRunOutput(
	id: string,
	signal?: AbortSignal,
	window?: RunOutputWindowRequest,
): Promise<RunOutputResponse> {
	const search = new URLSearchParams();
	if (window) {
		search.set('endByte', String(window.endByte));
		search.set('startByte', String(window.startByte));
	}
	const query = search.toString();
	return apiGet<RunOutputResponse>(`/api/v1/runs/${id}/output${query ? `?${query}` : ''}`, {
		signal,
	});
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

export async function stopRun(id: string): Promise<void> {
	await apiSend<{ ok: true }>(`/api/v1/runs/${id}/stop`, 'POST');
}
