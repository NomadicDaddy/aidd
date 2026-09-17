import { apiGet } from './client.ts';

export async function getActivePipelineSessionCount(): Promise<number> {
	const response = await apiGet<{ count: number }>('/api/v1/pipeline-sessions/active-count');
	return response.count;
}
