import type {
	DashboardSummary,
	FindingDismissalInput,
	PortStatusResponse,
	ProjectCreateInput,
	ProjectCreateResult,
	ProjectDeleteRequest,
	ProjectDeleteResult,
	ProjectDetail,
	ProjectFeature,
	ProjectFeatureStatus,
	ProjectImportAction,
	ProjectImportCandidatesResponse,
	ProjectImportResult,
	ProjectIntakePreview,
	ProjectInterviewDetail,
	ProjectMoveRequest,
	ProjectMoveResult,
	ProjectNamesResponse,
	ProjectRecommendInput,
	ProjectRecommendResult,
	ProjectReport,
	ProjectReportInput,
	ProjectReportsResponse,
	ProjectsGitStatusResponse,
	ProjectsListResponse,
	ProjectStartImplementationResult,
} from './types.ts';
import type { LaunchTargetValue } from './types/launchDefaults.ts';

import { apiGet, apiSend } from './client.ts';
import { projectApiPath } from './projectPath.ts';

export {
	previewProjectProfile,
	previewProjectProfiles,
	updateProjectProfile,
} from './projectProfiles.ts';
export type { ProfilePreview, ProjectProfilePreviewRequest } from './projectProfiles.ts';
export {
	getProjectCodeFile,
	getProjectCodeTree,
	getProjectCommitDiff,
	getProjectFileContent,
	getProjectGitStatus,
	getProjectRepositoryInfo,
	getProjectRepositoryRefs,
} from './projects/repository.ts';
export {
	commitProjectPaths,
	commitProjectStaged,
	discardProjectPaths,
	getProjectWorkingTree,
	resetProjectIndex,
	stageProjectPaths,
	unstageProjectPaths,
} from './projects/workingTree.ts';

export async function getProject(id: string, signal?: AbortSignal): Promise<ProjectDetail> {
	const response = await apiGet<{ project: ProjectDetail }>(projectApiPath(id), {
		signal,
	});
	return response.project;
}

export async function startProjectImplementation(
	id: string,
): Promise<ProjectStartImplementationResult> {
	return await apiSend<ProjectStartImplementationResult>(
		`${projectApiPath(id)}/start-implementation`,
		'POST',
		{},
	);
}

export async function getProjectInterview(id: string): Promise<ProjectInterviewDetail> {
	const response = await apiGet<{ interview: ProjectInterviewDetail }>(
		`${projectApiPath(id)}/interview`,
	);
	return response.interview;
}

export async function submitProjectInterviewAnswer(
	id: string,
	body: { answer: string; questionId: string },
): Promise<ProjectInterviewDetail> {
	const response = await apiSend<{ interview: ProjectInterviewDetail }>(
		`${projectApiPath(id)}/interview/responses`,
		'POST',
		body,
	);
	return response.interview;
}

export async function getProjectReports(
	id: string,
	signal?: AbortSignal,
): Promise<ProjectReportsResponse> {
	return await apiGet<ProjectReportsResponse>(`${projectApiPath(id)}/reports`, { signal });
}

export async function deleteProject(
	id: string,
	body: ProjectDeleteRequest,
): Promise<ProjectDeleteResult> {
	const response = await apiSend<{ deleted: ProjectDeleteResult }>(
		projectApiPath(id),
		'DELETE',
		body,
	);
	return response.deleted;
}

export async function moveProject(
	id: string,
	body: ProjectMoveRequest,
): Promise<ProjectMoveResult> {
	const response = await apiSend<{ project: ProjectMoveResult }>(
		`${projectApiPath(id)}/move`,
		'POST',
		body,
	);
	return response.project;
}

export async function approveProjectFeature(
	id: string,
	featureId: string,
	body: { decision?: string; decisionRequired: boolean },
): Promise<ProjectFeature> {
	const response = await apiSend<{ feature: ProjectFeature }>(
		`${projectApiPath(id)}/features/${encodeURIComponent(featureId)}/approval`,
		'POST',
		body,
	);
	return response.feature;
}

// The project-detail response carries feature summaries without `spec`, `notes`, `affectedFiles`
// or `aiddReport`, so the details dialog fetches the one record it renders those from.
export async function getProjectFeature(
	id: string,
	featureId: string,
	signal?: AbortSignal,
): Promise<ProjectFeature> {
	const response = await apiGet<{ feature: ProjectFeature }>(
		`${projectApiPath(id)}/features/${encodeURIComponent(featureId)}`,
		{ signal },
	);
	return response.feature;
}

export async function deleteProjectFeature(id: string, featureId: string): Promise<{ id: string }> {
	const response = await apiSend<{ deleted: { id: string } }>(
		`${projectApiPath(id)}/features/${encodeURIComponent(featureId)}`,
		'DELETE',
	);
	return response.deleted;
}

export async function dismissProjectFeature(
	id: string,
	featureId: string,
	body: FindingDismissalInput,
): Promise<{ id: string }> {
	const response = await apiSend<{ dismissed: { id: string } }>(
		`${projectApiPath(id)}/features/${encodeURIComponent(featureId)}/dismissal`,
		'POST',
		body,
	);
	return response.dismissed;
}

export async function submitProjectReport(
	id: string,
	body: ProjectReportInput,
): Promise<ProjectReport> {
	const response = await apiSend<{ report: ProjectReport }>(
		`${projectApiPath(id)}/reports`,
		'POST',
		body,
	);
	return response.report;
}

export async function listProjects(signal?: AbortSignal): Promise<ProjectsListResponse> {
	return await apiGet<ProjectsListResponse>('/api/v1/projects', { signal });
}

export async function listProjectNames(signal?: AbortSignal): Promise<ProjectNamesResponse> {
	return await apiGet<ProjectNamesResponse>('/api/v1/projects/names', { signal });
}

export async function getPortStatus(): Promise<PortStatusResponse> {
	return await apiGet<PortStatusResponse>('/api/v1/projects/port-status');
}

/**
 * The Dashboard's bounded read model. Deliberately not `listProjects()`: the landing page renders
 * six rows per card, and the full listing carries every feature record of every project (1.4 MB on
 * this fleet) plus a second round trip for port status, which this response folds in.
 */
export async function getDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary> {
	return await apiGet<DashboardSummary>('/api/v1/projects/dashboard-summary', { signal });
}

export async function getProjectsGitStatus(): Promise<ProjectsGitStatusResponse> {
	return await apiGet<ProjectsGitStatusResponse>('/api/v1/projects/git-status');
}

export async function listProjectImportCandidates(): Promise<ProjectImportCandidatesResponse> {
	return await apiGet<ProjectImportCandidatesResponse>('/api/v1/projects/import-candidates');
}

export async function getProjectIntakePreview(path: string): Promise<ProjectIntakePreview> {
	const response = await apiGet<{ preview: ProjectIntakePreview }>(
		`/api/v1/projects/intake-preview?path=${encodeURIComponent(path)}`,
	);
	return response.preview;
}

export async function dismissProjectInitFailure(id: string): Promise<void> {
	await apiSend(`/api/v1/projects/init-failures/${encodeURIComponent(id)}/dismiss`, 'POST');
}

export async function retryProjectInitFailure(id: string): Promise<void> {
	await apiSend(`/api/v1/projects/init-failures/${encodeURIComponent(id)}/retry`, 'POST');
}

export function projectInitFailureLogUrl(id: string): string {
	return `/api/v1/projects/init-failures/${encodeURIComponent(id)}/log`;
}

export async function importProjects(
	candidateIds: string[],
	action: ProjectImportAction,
	launchTarget: LaunchTargetValue,
): Promise<ProjectImportResult> {
	return await apiSend<ProjectImportResult>('/api/v1/projects/import', 'POST', {
		action,
		...launchTarget,
		candidateIds,
	});
}

export async function createProject(input: ProjectCreateInput): Promise<ProjectCreateResult> {
	return await apiSend<ProjectCreateResult>('/api/v1/projects', 'POST', input);
}

export async function recommendProjectMode(
	input: ProjectRecommendInput,
): Promise<ProjectRecommendResult> {
	return await apiSend<ProjectRecommendResult>('/api/v1/projects/recommend-mode', 'POST', input);
}

export async function updateProjectFeatureStatus(
	id: string,
	featureId: string,
	status: ProjectFeatureStatus,
): Promise<ProjectFeature> {
	const response = await apiSend<{ feature: ProjectFeature }>(
		`${projectApiPath(id)}/features/${encodeURIComponent(featureId)}/status`,
		'PUT',
		{ status },
	);
	return response.feature;
}

export async function updateProjectFeatureMetadata(
	id: string,
	featureId: string,
	body: { notes?: string[]; spec?: string },
): Promise<ProjectFeature> {
	const response = await apiSend<{ feature: ProjectFeature }>(
		`${projectApiPath(id)}/features/${encodeURIComponent(featureId)}/metadata`,
		'PATCH',
		body,
	);
	return response.feature;
}

export async function updateProjectFeatureMilestone(
	id: string,
	featureId: string,
	milestone: string,
): Promise<{ feature: ProjectFeature; roadmap: unknown }> {
	return await apiSend<{ feature: ProjectFeature; roadmap: unknown }>(
		`${projectApiPath(id)}/features/${encodeURIComponent(featureId)}/milestone`,
		'PUT',
		{ milestone },
	);
}
