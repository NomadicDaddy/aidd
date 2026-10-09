import type { BackendName } from '../plan/types.ts';
import type { ProviderRest } from '../provider-rest/decide.ts';

/** GET /api/v1/provider-rest: the rests in force and what a resting launch falls back to. */
export interface ProviderRestState {
	/** Backends a rate limit with a reported reset time rests on its own. */
	autoRestBackends: BackendName[];
	rests: ProviderRest[];
	/** Where a default or standing launch goes, in order, when its backend is resting. */
	substitutes: BackendName[];
}

/** PUT /api/v1/provider-rest/:backend: rest a backend by hand until `until` (ISO). */
export interface ProviderRestInput {
	reason?: string;
	until: string;
}

export interface ProviderRestSetResponse {
	rest: ProviderRest;
}
