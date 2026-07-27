import type {
	MilestoneCreateInput,
	MilestoneDeleteInput,
	MilestoneUpdateInput,
	ProjectMilestonePlan,
	ProjectMilestonesView,
} from './types.ts';

import { apiGet, apiSend } from './client.ts';
import { projectApiPath } from './projectPath.ts';

function milestonePath(id: string, name: string): string {
	return `${projectApiPath(id)}/milestones/${encodeURIComponent(name)}`;
}

export async function getProjectMilestones(
	id: string,
	signal?: AbortSignal,
): Promise<ProjectMilestonesView> {
	return await apiGet<ProjectMilestonesView>(`${projectApiPath(id)}/milestones`, { signal });
}

export async function createProjectMilestone(
	id: string,
	input: MilestoneCreateInput,
): Promise<ProjectMilestonePlan> {
	return await apiSend<ProjectMilestonePlan>(`${projectApiPath(id)}/milestones`, 'POST', input);
}

export async function updateProjectMilestone(
	id: string,
	name: string,
	input: MilestoneUpdateInput,
): Promise<ProjectMilestonePlan> {
	return await apiSend<ProjectMilestonePlan>(milestonePath(id, name), 'PATCH', input);
}

export async function deleteProjectMilestone(
	id: string,
	name: string,
	input: MilestoneDeleteInput,
): Promise<ProjectMilestonePlan> {
	return await apiSend<ProjectMilestonePlan>(milestonePath(id, name), 'DELETE', input);
}

export async function reassignProjectMilestones(
	id: string,
	input: { dryRun?: boolean },
): Promise<ProjectMilestonePlan> {
	return await apiSend<ProjectMilestonePlan>(
		`${projectApiPath(id)}/milestones/reassign`,
		'POST',
		input,
	);
}
