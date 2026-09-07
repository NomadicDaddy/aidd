import { agentBaseUrlValidationError } from 'aidd-shared/security/ssrfGuard';

import type { WebConfigSettings } from '../../api/types.ts';

export function directAiBaseUrlValidationError(baseUrl: null | string): null | string {
	return baseUrl ? agentBaseUrlValidationError(baseUrl, 'Direct AI') : null;
}

export function providerBaseUrlValidationError(
	baseUrl: null | string,
	provider: string,
): null | string {
	return baseUrl ? agentBaseUrlValidationError(baseUrl, `Provider "${provider}"`) : null;
}

export function settingsBaseUrlSaveBlockReason(form: WebConfigSettings): null | string {
	const directAiError = directAiBaseUrlValidationError(form.directAi.baseUrl);
	if (directAiError) return directAiError;
	for (const [provider, config] of Object.entries(form.providers)) {
		const providerError = providerBaseUrlValidationError(config.baseUrl, provider);
		if (providerError) return providerError;
	}
	return null;
}
