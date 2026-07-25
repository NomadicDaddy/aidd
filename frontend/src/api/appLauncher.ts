import type { AppLaunch } from './types.ts';

import { apiGet, apiSend } from './client.ts';

export async function getAppLaunchStatus(projectId: string): Promise<AppLaunch> {
	const response = await apiGet<{ launch: AppLaunch }>(
		`/api/v1/app-launcher/status/${encodeURIComponent(projectId)}`,
	);
	return response.launch;
}

export async function getAllAppLaunchStatuses(): Promise<AppLaunch[]> {
	const response = await apiGet<{ launches: AppLaunch[] }>('/api/v1/app-launcher/status');
	return response.launches;
}

export async function startApp(projectId: string): Promise<AppLaunch> {
	const response = await apiSend<{ launch: AppLaunch }>('/api/v1/app-launcher/start', 'POST', {
		projectId,
	});
	return response.launch;
}

export async function stopApp(projectId: string): Promise<AppLaunch> {
	const response = await apiSend<{ launch: AppLaunch }>('/api/v1/app-launcher/stop', 'POST', {
		projectId,
	});
	return response.launch;
}
