import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import {
	DirectAiService,
	resolveDirectAiReasoningEffort,
} from '../../backend/src/services/directAiService.ts';

type WebRuntimeConfig = { web: ResolvedWebConfig } & ResolvedConfig;

// The service resolves a provider key from the ambient environment, which is what an operator
// wants and what makes these cases depend on the shell they run in: with a real ZHIPU_API_KEY
// exported, "no key configured" would resolve one and the file-key assertions would read the
// wrong value. Scrub the two variables the zhipu path consults so the assertions below mean the
// same thing on a developer machine as they do in CI. Precedence itself is covered against an
// injected environment in test/cli/direct-ai-credentials.test.ts.
const scrubbedKeys = ['NATIVE_API_KEY', 'ZHIPU_API_KEY'];
const savedKeys = new Map<string, string | undefined>();

beforeAll(() => {
	for (const key of scrubbedKeys) {
		savedKeys.set(key, process.env[key]);
		delete process.env[key];
	}
});

afterAll(() => {
	for (const [key, value] of savedKeys) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

function configWith(options: {
	enabled: boolean;
	directorChat: boolean;
	apiKey?: string;
}): WebRuntimeConfig {
	return {
		directAi: {
			enabled: options.enabled,
			model: 'glm-5.3',
			provider: 'zhipu',
			surfaces: {
				directorChat: options.directorChat,
				directorCycle: options.enabled,
				projectAdvisor: options.enabled,
			},
			timeoutSeconds: 45,
		},
		providers: options.apiKey ? { zhipu: { apiKey: options.apiKey } } : {},
		reasoningEffort: 'low',
	} as unknown as WebRuntimeConfig;
}

describe('DirectAiService.resolveClientConfig', () => {
	test('returns a client config when the surface is enabled and resolvable', () => {
		const service = new DirectAiService(
			configWith({ enabled: true, directorChat: true, apiKey: 'secret' }),
		);
		const config = service.resolveClientConfig('directorChat');
		expect(config).not.toBeNull();
		expect(config).toMatchObject({ provider: 'zhipu', apiKey: 'secret' });
		expect(config?.baseUrl).toContain('z.ai');
	});

	test('returns null when the surface is disabled', () => {
		const service = new DirectAiService(
			configWith({ enabled: true, directorChat: false, apiKey: 'secret' }),
		);
		expect(service.resolveClientConfig('directorChat')).toBeNull();
	});

	test('returns null when the provider is misconfigured (missing api key)', () => {
		const service = new DirectAiService(configWith({ enabled: true, directorChat: true }));
		expect(service.resolveClientConfig('directorChat')).toBeNull();
	});
});

describe('DirectAiService.resolveSurfaceMeta', () => {
	test('returns the resolved provider, model, and reasoning effort', () => {
		const service = new DirectAiService(
			configWith({ enabled: true, directorChat: true, apiKey: 'secret' }),
		);
		expect(service.resolveSurfaceMeta('directorCycle', 'high')).toEqual({
			model: 'glm-5.3',
			provider: 'zhipu',
			reasoningEffort: 'high',
		});
	});
});

describe('resolveDirectAiReasoningEffort', () => {
	test('honors precedence: request > directAi > provider > fallback', () => {
		const fallbackOnly = resolveDirectAiReasoningEffort({
			requestEffort: undefined,
			directAiEffort: undefined,
			providerEffort: undefined,
			fallbackEffort: 'low',
		});
		expect(fallbackOnly).toBe('low');

		const providerOverridesFallback = resolveDirectAiReasoningEffort({
			requestEffort: undefined,
			directAiEffort: undefined,
			providerEffort: 'high',
			fallbackEffort: 'low',
		});
		expect(providerOverridesFallback).toBe('high');

		const directAiOverridesProvider = resolveDirectAiReasoningEffort({
			requestEffort: undefined,
			directAiEffort: 'medium',
			providerEffort: 'high',
			fallbackEffort: 'low',
		});
		expect(directAiOverridesProvider).toBe('medium');

		const requestOverridesAll = resolveDirectAiReasoningEffort({
			requestEffort: 'xhigh',
			directAiEffort: 'medium',
			providerEffort: 'high',
			fallbackEffort: 'low',
		});
		expect(requestOverridesAll).toBe('xhigh');
	});
});
