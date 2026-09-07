import type {
	CommitDiffResponse,
	ProjectCodeFileResponse,
	ProjectCodeTreeResponse,
	ProjectFileResponse,
	ProjectGitStatusResponse,
	RepositoryInfoResponse,
	RepositoryRefsResponse,
} from '../types.ts';

import { apiGet } from '../client.ts';
import { projectApiPath } from '../projectPath.ts';

export async function getProjectCommitDiff(
	id: string,
	sha: string,
	signal?: AbortSignal,
): Promise<CommitDiffResponse> {
	return await apiGet<CommitDiffResponse>(
		`${projectApiPath(id)}/commits/${encodeURIComponent(sha)}`,
		{ signal },
	);
}

export async function getProjectRepositoryInfo(
	id: string,
	signal?: AbortSignal,
): Promise<RepositoryInfoResponse> {
	return await apiGet<RepositoryInfoResponse>(`${projectApiPath(id)}/repository-info`, {
		signal,
	});
}

export async function getProjectRepositoryRefs(
	id: string,
	signal?: AbortSignal,
): Promise<RepositoryRefsResponse> {
	return await apiGet<RepositoryRefsResponse>(`${projectApiPath(id)}/repository-refs`, {
		signal,
	});
}

export async function getProjectGitStatus(
	id: string,
	signal?: AbortSignal,
): Promise<ProjectGitStatusResponse> {
	return await apiGet<ProjectGitStatusResponse>(`${projectApiPath(id)}/git-status`, {
		signal,
	});
}

export async function getProjectCodeTree(
	id: string,
	signal?: AbortSignal,
): Promise<ProjectCodeTreeResponse> {
	return await apiGet<ProjectCodeTreeResponse>(`${projectApiPath(id)}/code/tree`, { signal });
}

export async function getProjectCodeFile(
	id: string,
	path: string,
	signal?: AbortSignal,
): Promise<ProjectCodeFileResponse> {
	return await apiGet<ProjectCodeFileResponse>(
		`${projectApiPath(id)}/code/file?path=${encodeURIComponent(path)}`,
		{ signal },
	);
}

export async function getProjectFileContent(
	id: string,
	path: string,
	signal?: AbortSignal,
): Promise<ProjectFileResponse> {
	return await apiGet<ProjectFileResponse>(
		`${projectApiPath(id)}/file?path=${encodeURIComponent(path)}`,
		{ signal },
	);
}
