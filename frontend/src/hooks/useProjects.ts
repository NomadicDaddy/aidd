import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
	ProjectCreateInput,
	ProjectDeleteRequest,
	ProjectImportAction,
	ProjectMoveRequest,
	ProjectRecommendInput,
} from '../api/types.ts';

import {
	runMaturityNext,
	updateMaturitySkip,
	type MaturityRunNextRequest,
} from '../api/maturity.ts';
import {
	createProject,
	deleteProject,
	dismissProjectInitFailure,
	getPortStatus,
	getProject,
	getProjectGitStatus,
	getProjectInterview,
	getProjectIntakePreview,
	getProjectReports,
	getProjectsGitStatus,
	importProjects,
	retryProjectInitFailure,
	listProjectImportCandidates,
	listProjectNames,
	listProjects,
	moveProject,
	recommendProjectMode,
	submitProjectInterviewAnswer,
	startProjectImplementation,
} from '../api/projects.ts';
import { retryUnlessClientError } from '../api/retry.ts';
import { invalidateProjectQueries } from './useProjectsShared.ts';

export {
	useApproveProjectFeature,
	useDeleteProjectFeature,
	useSubmitProjectReport,
	useUpdateProjectFeatureMetadata,
	useUpdateProjectFeatureMilestone,
	useUpdateProjectFeatureStatus,
	useUpdateProjectProfile,
} from './useProjectFeatures.ts';

export function useProject(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getProject(id ?? '', signal),
		queryKey: ['project', id],
		retry: retryUnlessClientError,
	});
}

export function useProjectInterview(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: () => getProjectInterview(id ?? ''),
		queryKey: ['project-interview', id],
		retry: retryUnlessClientError,
	});
}

export function useSubmitProjectInterviewAnswer(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: { answer: string; questionId: string }) =>
			submitProjectInterviewAnswer(id ?? '', body),
		onSuccess: () => {
			// Prefix-matched for the same reason as invalidateProjectQueries: the interview
			// query is keyed on the route param while this mutation holds the opaque id.
			void queryClient.invalidateQueries({ queryKey: ['project-interview'] });
			void queryClient.invalidateQueries({ queryKey: ['project'] });
			void queryClient.invalidateQueries({ queryKey: ['projects'] });
		},
	});
}

export function useProjectReports(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getProjectReports(id ?? '', signal),
		queryKey: ['project-reports', id],
		retry: retryUnlessClientError,
	});
}

export function useDeleteProject(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: ProjectDeleteRequest) => deleteProject(id ?? '', request),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['project'] });
			void queryClient.invalidateQueries({ queryKey: ['projects'] });
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
			void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
		},
	});
}

export function useMoveProject(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: ProjectMoveRequest) => moveProject(id ?? '', request),
		onSuccess: () => {
			// A move changes the project's path, and therefore its opaque id and its route id.
			// This used to invalidate the old and new ids explicitly; the family match covers
			// both, including the entry keyed on whichever identity the URL carried.
			void queryClient.invalidateQueries({ queryKey: ['project'] });
			void queryClient.invalidateQueries({ queryKey: ['projects'] });
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
			void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
		},
	});
}

export function useProjects() {
	return useQuery({
		queryFn: ({ signal }) => listProjects(signal),
		queryKey: ['projects'],
		staleTime: 30_000,
	});
}

// Lightweight project list (id + name + path) for the report dialog's picker.
// Backed by /api/v1/projects/names, which skips the heavy per-project metadata compute and keeps
// the report dialog from blocking on a full project scan when the filesystem cache is cold.
export function useProjectNames() {
	return useQuery({
		queryFn: ({ signal }) => listProjectNames(signal),
		queryKey: ['project-names'],
		staleTime: 30_000,
	});
}

export function usePortStatus() {
	// Freshness is driven by the backend `app_launch` WebSocket event (see
	// useRealtimeInvalidation) — an app starting/stopping is when its ports change —
	// plus a full refresh on socket reconnect, instead of client-side polling.
	return useQuery({
		queryFn: getPortStatus,
		queryKey: ['port-status'],
		staleTime: 15_000,
	});
}

export function useProjectsGitStatus() {
	return useQuery({
		queryFn: getProjectsGitStatus,
		queryKey: ['projects', 'git-status'],
		retry: retryUnlessClientError,
		staleTime: 15_000,
	});
}

export function useProjectGitStatus(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getProjectGitStatus(id ?? '', signal),
		queryKey: ['project-git-status', id],
		retry: retryUnlessClientError,
		staleTime: 15_000,
	});
}

export function useProjectImportCandidates(enabled: boolean) {
	return useQuery({
		enabled,
		queryFn: listProjectImportCandidates,
		queryKey: ['projects', 'import-candidates'],
	});
}

export function useProjectIntakePreview(path: string | undefined) {
	return useQuery({
		enabled: path !== undefined && path.length > 0,
		queryFn: () => getProjectIntakePreview(path ?? ''),
		queryKey: ['projects', 'intake-preview', path],
	});
}

export function useUpdateMaturitySkip(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (skip: string[]) => updateMaturitySkip(id ?? '', skip),
		onSuccess: () => invalidateProjectQueries(queryClient),
	});
}

export function useRunMaturityNext(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: MaturityRunNextRequest) => runMaturityNext(id ?? '', body),
		onSuccess: () => {
			invalidateProjectQueries(queryClient);
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
		},
	});
}

export function useDismissProjectInitFailure() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => dismissProjectInitFailure(id),
		onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['projects'] }),
	});
}

export function useRetryProjectInitFailure() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => retryProjectInitFailure(id),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['projects'] });
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
			void queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
		},
	});
}

export function useImportProjects() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { action: ProjectImportAction; candidateIds: string[] }) =>
			importProjects(input.candidateIds, input.action),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['projects'] });
			void queryClient.invalidateQueries({ queryKey: ['projects', 'import-candidates'] });
			void queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
			void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
			// Director suggestions register under ['suggestions'] (see useSuggestions in
			// useDirector.ts), not ['director', 'suggestions'] — invalidate the real key so
			// importing projects refreshes downstream suggestions.
			void queryClient.invalidateQueries({ queryKey: ['suggestions'] });
		},
	});
}

export function useCreateProject() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: ProjectCreateInput) => createProject(input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['projects'] });
			void queryClient.invalidateQueries({ queryKey: ['projects', 'import-candidates'] });
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
			void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
		},
	});
}

export function useStartProjectImplementation(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => startProjectImplementation(id ?? ''),
		onSuccess: () => {
			invalidateProjectQueries(queryClient);
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
		},
	});
}

export function useRecommendProjectMode() {
	return useMutation({
		mutationFn: (input: ProjectRecommendInput) => recommendProjectMode(input),
	});
}
