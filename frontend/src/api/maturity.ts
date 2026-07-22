import type { BackendName } from './types/skills.ts';

import { apiSend } from './client.ts';
import { projectApiPath } from './projectPath.ts';

export interface MaturityRunNextRequest {
	auditName?: string;
	/** Optional launch-target override for the run/session this action starts. */
	backend?: BackendName;
	model?: string;
	reasoningEffort?: string;
	slug: string;
}

export interface MaturityRunNextResponse {
	args?: string;
	auditName?: string;
	command?: string;
	hint?: string;
	invocation: string;
	postScript?: string;
	runId?: string;
	sessionId?: string;
	skillId?: string;
	slug: string;
	target?: string;
}

export interface MaturitySkipResponse {
	skip: string[];
}

export async function updateMaturitySkip(
	projectId: string,
	skip: string[]
): Promise<MaturitySkipResponse> {
	return await apiSend<MaturitySkipResponse>(
		`${projectApiPath(projectId)}/maturity/skip`,
		'POST',
		{ skip }
	);
}

export async function runMaturityNext(
	projectId: string,
	body: MaturityRunNextRequest
): Promise<MaturityRunNextResponse> {
	return await apiSend<MaturityRunNextResponse>(
		`${projectApiPath(projectId)}/maturity/run-next`,
		'POST',
		body
	);
}
