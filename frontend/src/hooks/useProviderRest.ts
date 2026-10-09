import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BackendName } from '../api/types.ts';
import type { ProviderRestInput } from '../api/types/providerRest.ts';

import { clearProviderRest, getProviderRest, setProviderRest } from '../api/providerRest.ts';

const providerRestKey = ['provider-rest'];

/** Rests in force; refetched on an interval because rate limits add them from runs. */
export function useProviderRest() {
	return useQuery({
		queryFn: getProviderRest,
		queryKey: providerRestKey,
		refetchInterval: 30_000,
	});
}

export function useSetProviderRest() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ backend, input }: { backend: BackendName; input: ProviderRestInput }) =>
			setProviderRest(backend, input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: providerRestKey });
		},
	});
}

export function useClearProviderRest() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (backend: BackendName) => clearProviderRest(backend),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: providerRestKey });
		},
	});
}
