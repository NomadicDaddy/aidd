import type { ProjectNotesResponse } from './types.ts';

import { apiGet, apiSend } from './client.ts';
import { projectApiPath } from './projectPath.ts';

export async function getProjectNotes(
	id: string,
	signal?: AbortSignal,
): Promise<ProjectNotesResponse> {
	return await apiGet<ProjectNotesResponse>(`${projectApiPath(id)}/notes`, { signal });
}

export async function saveProjectNotes(id: string, content: string): Promise<ProjectNotesResponse> {
	return await apiSend<ProjectNotesResponse>(`${projectApiPath(id)}/notes`, 'PUT', { content });
}
