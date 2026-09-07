import { apiSend } from './client.ts';

interface AdminActionResponse {
	status: string;
}

export async function requestWebRestart(): Promise<AdminActionResponse> {
	return await apiSend<AdminActionResponse>('/api/v1/admin/restart', 'POST');
}

export async function requestWebShutdown(): Promise<AdminActionResponse> {
	return await apiSend<AdminActionResponse>('/api/v1/admin/shutdown', 'POST');
}
