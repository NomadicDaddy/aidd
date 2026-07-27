import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
	MilestoneCreateInput,
	MilestoneDeleteInput,
	MilestoneUpdateInput,
	ProjectMilestonePlan,
} from '../api/types.ts';

import {
	createProjectMilestone,
	deleteProjectMilestone,
	getProjectMilestones,
	reassignProjectMilestones,
	updateProjectMilestone,
} from '../api/projectMilestones.ts';
import { retryUnlessClientError } from '../api/retry.ts';
import { cancelProjectQueries, invalidateProjectQueries } from './useProjectsShared.ts';

export function projectMilestonesQueryKey(id: string | undefined): unknown[] {
	return ['project-milestones', id];
}

export function useProjectMilestones(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getProjectMilestones(id ?? '', signal),
		queryKey: projectMilestonesQueryKey(id),
		retry: retryUnlessClientError,
	});
}

// Every mutation here reaches roadmap.json, which feeds the milestone badges, the roadmap summary on
// the overview tab, and the feature milestone dropdowns. Invalidating the project family alone would
// leave this tab's own query stale, so both are refreshed — but only when the plan was applied. A
// dry-run changed nothing, and refetching under an open preview dialog would swap the data out from
// under the operator mid-decision.
function useMilestoneMutation<TVariables>(
	mutationFn: (variables: TVariables) => Promise<ProjectMilestonePlan>,
	id: string | undefined,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn,
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: ['project-milestones'] });
			await cancelProjectQueries(queryClient);
		},
		onSuccess: (result) => {
			if (!result.applied) return;
			void queryClient.invalidateQueries({ queryKey: projectMilestonesQueryKey(id) });
			invalidateProjectQueries(queryClient);
		},
	});
}

export function useCreateProjectMilestone(id: string | undefined) {
	return useMilestoneMutation(
		(input: MilestoneCreateInput) => createProjectMilestone(id ?? '', input),
		id,
	);
}

export function useUpdateProjectMilestone(id: string | undefined) {
	return useMilestoneMutation(
		({ input, name }: { input: MilestoneUpdateInput; name: string }) =>
			updateProjectMilestone(id ?? '', name, input),
		id,
	);
}

export function useDeleteProjectMilestone(id: string | undefined) {
	return useMilestoneMutation(
		({ input, name }: { input: MilestoneDeleteInput; name: string }) =>
			deleteProjectMilestone(id ?? '', name, input),
		id,
	);
}

export function useReassignProjectMilestones(id: string | undefined) {
	return useMilestoneMutation(
		(input: { dryRun?: boolean }) => reassignProjectMilestones(id ?? '', input),
		id,
	);
}
