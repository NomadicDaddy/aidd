import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { WebConfigSettings } from '../api/types.ts';

import {
	getCliStatus,
	getSettingsConfig,
	getSourceControlStatus,
	updateSettingsConfig,
} from '../api/settings.ts';
import { createToolStatusGate } from './toolStatusRefresh.ts';

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

/**
 * Tool status changes only when a CLI is installed, removed, or upgraded, and probing it
 * spawns a subprocess per tool. The backend therefore caches its probe, and these hooks
 * hold the result indefinitely: a plain load (or tab revisit) reuses it, while `refetch`
 * asks the backend for a genuine re-probe. Without the flag the two are indistinguishable
 * over HTTP and Refresh would silently return the cached answer.
 */
function useToolStatus<T>(
	queryKey: string,
	fetcher: (refresh?: boolean) => Promise<T>,
): {
	data: T | undefined;
	isError: boolean;
	isFetching: boolean;
	isLoading: boolean;
	refetch: () => void;
} {
	// Lazy initial state, not a ref: the gate must be created exactly once per hook instance
	// (a fresh one would drop a pending refresh), and reading a ref during render is banned.
	const [gate] = useState(() => createToolStatusGate(fetcher));
	const query = useQuery({
		placeholderData: keepPreviousData,
		queryFn: gate.run,
		queryKey: [queryKey],
		staleTime: Infinity,
	});
	return {
		data: query.data,
		isError: query.isError,
		isFetching: query.isFetching,
		isLoading: query.isLoading,
		refetch: () => {
			gate.requestRefresh();
			void query.refetch();
		},
	};
}

export function useCliStatus() {
	return useToolStatus('settings-cli-status', getCliStatus);
}

export function useSourceControlStatus() {
	return useToolStatus('settings-source-control-status', getSourceControlStatus);
}

/**
 * Kicks off background prefetches for CLI-status and source-control status
 * queries so the data is already cached when the user navigates to the
 * Backends or Source Control tab, avoiding the loading → data "pop".
 */
export function usePrefetchStatusPanels() {
	const queryClient = useQueryClient();
	// Arrow wrappers matter: react-query calls queryFn with a context object, which as a
	// positional `refresh` argument would be truthy and force a re-probe on every prefetch.
	void queryClient.prefetchQuery({
		queryFn: () => getCliStatus(),
		queryKey: ['settings-cli-status'],
		staleTime: Infinity,
	});
	void queryClient.prefetchQuery({
		queryFn: () => getSourceControlStatus(),
		queryKey: ['settings-source-control-status'],
		staleTime: Infinity,
	});
}
