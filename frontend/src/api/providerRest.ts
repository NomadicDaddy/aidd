import type { BackendName } from './types.ts';
import type {
	ProviderRestInput,
	ProviderRestSetResponse,
	ProviderRestState,
} from './types/providerRest.ts';

import { apiGet, apiSend } from './client.ts';

// Paths stay literal so check:api-types can pair each call with its backend route.
export async function getProviderRest(): Promise<ProviderRestState> {
	return await apiGet<ProviderRestState>('/api/v1/provider-rest');
}

export async function setProviderRest(
	backend: BackendName,
	input: ProviderRestInput,
): Promise<ProviderRestSetResponse> {
	return await apiSend<ProviderRestSetResponse>(`/api/v1/provider-rest/${backend}`, 'PUT', input);
}

export async function clearProviderRest(backend: BackendName): Promise<void> {
	await apiSend(`/api/v1/provider-rest/${backend}`, 'DELETE');
}
