import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
	AuditLaunchRequest,
	AuditProfileMapping,
	AuditProfileOverrides,
} from '../api/types.ts';

import {
	getAuditDefinition,
	getAuditManager,
	getAuditProfileMapping,
	getProjectAudits,
	getProjectAuditOverrides,
	launchAudits,
	saveAuditDefinition,
	saveAuditProfileMapping,
	saveProjectAuditOverrides,
} from '../api/audits.ts';

export function useAuditManager() {
	return useQuery({
		queryFn: getAuditManager,
		queryKey: ['audits'],
	});
}

export function useAuditDefinition(name: null | string) {
	return useQuery({
		enabled: Boolean(name),
		queryFn: () => getAuditDefinition(name ?? ''),
		queryKey: ['audits', name],
	});
}

export function useProjectAudits(projectId: null | string) {
	return useQuery({
		enabled: Boolean(projectId),
		queryFn: () => getProjectAudits(projectId ?? ''),
		queryKey: ['audits', 'project', projectId],
	});
}

export function useLaunchAudits() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: AuditLaunchRequest) => launchAudits(request),
		onSuccess: (_result, variables) => {
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
			void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
			for (const projectId of variables.projectIds) {
				void queryClient.invalidateQueries({ queryKey: ['audits', 'project', projectId] });
			}
		},
	});
}

export function useSaveAuditDefinition() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ content, name }: { content: string; name: string }) =>
			saveAuditDefinition(name, content),
		onSuccess: (_definition, variables) => {
			void queryClient.invalidateQueries({ queryKey: ['audits'] });
			void queryClient.invalidateQueries({ queryKey: ['audits', variables.name] });
		},
	});
}

export function useAuditProfileMapping() {
	return useQuery({
		queryFn: getAuditProfileMapping,
		queryKey: ['audits', 'profile-mapping'],
	});
}

export function useUpdateAuditProfileMapping() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (mapping: AuditProfileMapping) => saveAuditProfileMapping(mapping),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['audits'] });
		},
	});
}

export function useProjectAuditOverrides(projectId: null | string) {
	return useQuery({
		enabled: Boolean(projectId),
		queryFn: () => getProjectAuditOverrides(projectId ?? ''),
		queryKey: ['audits', 'project-overrides', projectId],
	});
}

export function useUpdateProjectAuditOverrides() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			overrides,
			projectId,
		}: {
			overrides: AuditProfileOverrides;
			projectId: string;
		}) => saveProjectAuditOverrides(projectId, overrides),
		onSuccess: (_overrides, variables) => {
			void queryClient.invalidateQueries({
				queryKey: ['audits', 'project-overrides', variables.projectId],
			});
			void queryClient.invalidateQueries({
				queryKey: ['audits', 'project', variables.projectId],
			});
			void queryClient.invalidateQueries({ queryKey: ['audits'] });
		},
	});
}
