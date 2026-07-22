import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { WebConfigSettings } from '../api/types.ts';

import {
	getCliStatus,
	getSettingsConfig,
	getSourceControlStatus,
	updateSettingsConfig,
} from '../api/settings.ts';

export function useSettingsConfig() {
	return useQuery({
		queryFn: getSettingsConfig,
		queryKey: ['settings-config'],
	});
}

export function useUpdateSettingsConfig() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: WebConfigSettings) => updateSettingsConfig(request),
		onSuccess: (config) => {
			queryClient.setQueryData(['settings-config'], config);
			// Launch chips display resolved defaults; a settings save changes them now.
			void queryClient.invalidateQueries({ queryKey: ['launch-defaults'] });
			void queryClient.invalidateQueries({ queryKey: ['projects'] });
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
		},
	});
}

export function useCliStatus() {
	return useQuery({
		placeholderData: keepPreviousData,
		queryFn: getCliStatus,
		queryKey: ['settings-cli-status'],
	});
}

export function useSourceControlStatus() {
	return useQuery({
		placeholderData: keepPreviousData,
		queryFn: getSourceControlStatus,
		queryKey: ['settings-source-control-status'],
	});
}

/**
 * Kicks off background prefetches for CLI-status and source-control status
 * queries so the data is already cached when the user navigates to the
 * Backends or Source Control tab, avoiding the loading → data "pop".
 */
export function usePrefetchStatusPanels() {
	const queryClient = useQueryClient();
	void queryClient.prefetchQuery({ queryFn: getCliStatus, queryKey: ['settings-cli-status'] });
	void queryClient.prefetchQuery({
		queryFn: getSourceControlStatus,
		queryKey: ['settings-source-control-status'],
	});
}
