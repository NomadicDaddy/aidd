import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
	FindingDismissalInput,
	ProjectAssuranceProfileInput,
	ProjectFeatureStatus,
	ProjectReportInput,
} from '../api/types.ts';

import {
	approveProjectFeature,
	deleteProjectFeature,
	dismissProjectFeature,
	submitProjectReport,
	updateProjectFeatureMetadata,
	updateProjectFeatureMilestone,
	updateProjectFeatureStatus,
	updateProjectProfile,
} from '../api/projects.ts';
import { cancelProjectQueries, invalidateProjectQueries } from './useProjectsShared.ts';

export function useApproveProjectFeature(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			decision,
			decisionRequired,
			featureId,
		}: {
			decision?: string;
			decisionRequired: boolean;
			featureId: string;
		}) => {
			const body: { decision?: string; decisionRequired: boolean } = { decisionRequired };
			if (decision !== undefined) body.decision = decision;
			return approveProjectFeature(id ?? '', featureId, body);
		},
		onMutate: async () => await cancelProjectQueries(queryClient),
		onSuccess: () => invalidateProjectQueries(queryClient),
	});
}

export function useDeleteProjectFeature(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (featureId: string) => deleteProjectFeature(id ?? '', featureId),
		onMutate: async () => await cancelProjectQueries(queryClient),
		onSuccess: () => invalidateProjectQueries(queryClient),
	});
}

export function useDismissProjectFeature(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ featureId, input }: { featureId: string; input: FindingDismissalInput }) =>
			dismissProjectFeature(id ?? '', featureId, input),
		onMutate: async () => await cancelProjectQueries(queryClient),
		onSuccess: () => invalidateProjectQueries(queryClient),
	});
}

export function useSubmitProjectReport() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ projectId, report }: { projectId: string; report: ProjectReportInput }) =>
			submitProjectReport(projectId, report),
		onMutate: async () => await cancelProjectQueries(queryClient),
		onSuccess: () => invalidateProjectQueries(queryClient),
	});
}

export function useUpdateProjectFeatureMetadata(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			category,
			featureId,
			notes,
			spec,
		}: {
			category?: null | string;
			featureId: string;
			notes?: string[];
			spec?: string;
		}) => {
			const body: { category?: null | string; notes?: string[]; spec?: string } = {};
			if (category !== undefined) body.category = category;
			if (notes !== undefined) body.notes = notes;
			if (spec !== undefined) body.spec = spec;
			return updateProjectFeatureMetadata(id ?? '', featureId, body);
		},
		onMutate: async () => await cancelProjectQueries(queryClient),
		onSuccess: () => invalidateProjectQueries(queryClient),
	});
}

export function useUpdateProjectFeatureStatus(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ featureId, status }: { featureId: string; status: ProjectFeatureStatus }) =>
			updateProjectFeatureStatus(id ?? '', featureId, status),
		onMutate: async () => await cancelProjectQueries(queryClient),
		onSuccess: () => invalidateProjectQueries(queryClient),
	});
}

export function useUpdateProjectFeatureMilestone(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ featureId, milestone }: { featureId: string; milestone: string }) =>
			updateProjectFeatureMilestone(id ?? '', featureId, milestone),
		onMutate: async () => await cancelProjectQueries(queryClient),
		onSuccess: () => invalidateProjectQueries(queryClient),
	});
}

export function useUpdateProjectProfile(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (profile: ProjectAssuranceProfileInput) =>
			updateProjectProfile(id ?? '', profile),
		onMutate: async () => await cancelProjectQueries(queryClient),
		onSuccess: () => invalidateProjectQueries(queryClient),
	});
}
