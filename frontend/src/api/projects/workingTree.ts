import type { WorkingTreeActionResponse, WorkingTreeResponse } from '../types.ts';

import { apiGet, apiSend } from '../client.ts';
import { projectApiPath } from '../projectPath.ts';

function workingTreePath(id: string, action = ''): string {
	return `${projectApiPath(id)}/working-tree${action}`;
}

export async function getProjectWorkingTree(
	id: string,
	signal?: AbortSignal,
): Promise<WorkingTreeResponse> {
	return await apiGet<WorkingTreeResponse>(workingTreePath(id), { signal });
}

export async function stageProjectPaths(
	id: string,
	paths: string[],
): Promise<WorkingTreeActionResponse> {
	return await apiSend<WorkingTreeActionResponse>(workingTreePath(id, '/stage'), 'POST', {
		paths,
	});
}

export async function unstageProjectPaths(
	id: string,
	paths: string[],
): Promise<WorkingTreeActionResponse> {
	return await apiSend<WorkingTreeActionResponse>(workingTreePath(id, '/unstage'), 'POST', {
		paths,
	});
}

export async function discardProjectPaths(
	id: string,
	paths: string[],
): Promise<WorkingTreeActionResponse> {
	return await apiSend<WorkingTreeActionResponse>(workingTreePath(id, '/discard'), 'POST', {
		paths,
	});
}

export async function resetProjectIndex(id: string): Promise<WorkingTreeActionResponse> {
	return await apiSend<WorkingTreeActionResponse>(workingTreePath(id, '/reset'), 'POST', {});
}

export async function commitProjectPaths(
	id: string,
	paths: string[],
	message: string,
): Promise<WorkingTreeActionResponse> {
	return await apiSend<WorkingTreeActionResponse>(workingTreePath(id, '/commit'), 'POST', {
		message,
		paths,
	});
}

export async function commitProjectStaged(
	id: string,
	message: string,
): Promise<WorkingTreeActionResponse> {
	return await apiSend<WorkingTreeActionResponse>(workingTreePath(id, '/commit-staged'), 'POST', {
		message,
	});
}
