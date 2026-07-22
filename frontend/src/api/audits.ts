import type {
	AuditDefinition,
	AuditLaunchRequest,
	AuditLaunchResult,
	AuditManager,
	AuditProfileMapping,
	AuditProfileMappingResponse,
	AuditProfileOverrides,
	ProjectAuditsResponse,
} from './types.ts';

import { apiGet, apiSend } from './client.ts';

export async function getAuditManager(): Promise<AuditManager> {
	return await apiGet<AuditManager>('/api/v1/audits');
}

export async function getAuditDefinition(name: string): Promise<AuditDefinition> {
	const response = await apiGet<{ definition: AuditDefinition }>(
		`/api/v1/audits/${encodeURIComponent(name)}`
	);
	return response.definition;
}

export async function launchAudits(request: AuditLaunchRequest): Promise<AuditLaunchResult> {
	const response = await apiSend<{ result: AuditLaunchResult }>(
		'/api/v1/audits/launch',
		'POST',
		request
	);
	return response.result;
}

export async function saveAuditDefinition(name: string, content: string): Promise<AuditDefinition> {
	const response = await apiSend<{ definition: AuditDefinition }>(
		`/api/v1/audits/${encodeURIComponent(name)}`,
		'PUT',
		{ content }
	);
	return response.definition;
}

export async function getAuditProfileMapping(): Promise<AuditProfileMappingResponse> {
	return await apiGet<AuditProfileMappingResponse>('/api/v1/audits/profile-mapping');
}

export async function saveAuditProfileMapping(
	mapping: AuditProfileMapping
): Promise<AuditProfileMappingResponse> {
	return await apiSend<AuditProfileMappingResponse>(
		'/api/v1/audits/profile-mapping',
		'PUT',
		mapping
	);
}

export async function getProjectAudits(projectId: string): Promise<ProjectAuditsResponse> {
	return await apiGet<ProjectAuditsResponse>(
		`/api/v1/audits/project/${encodeURIComponent(projectId)}`
	);
}

export async function getProjectAuditOverrides(projectId: string): Promise<AuditProfileOverrides> {
	const response = await apiGet<{ overrides: AuditProfileOverrides }>(
		`/api/v1/audits/project-overrides/${encodeURIComponent(projectId)}`
	);
	return response.overrides;
}

export async function saveProjectAuditOverrides(
	projectId: string,
	overrides: AuditProfileOverrides
): Promise<AuditProfileOverrides> {
	const response = await apiSend<{ overrides: AuditProfileOverrides }>(
		`/api/v1/audits/project-overrides/${encodeURIComponent(projectId)}`,
		'PUT',
		overrides
	);
	return response.overrides;
}
