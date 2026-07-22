import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
	getProvider,
	getProviderNames,
	inferProviderFromModel,
	OLLAMA_PROVIDER,
} from './providers/index';
import { OllamaProvider } from './providers/ollama';
import type { ProviderSettings, ZRunConfig, ZRunFileConfig } from './types';

const DEFAULT_MAX_TURNS = 500;
const ZHIPU_PROVIDER = 'zhipu';

function loadJsonConfig(path: string): ZRunFileConfig | null {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as ZRunFileConfig;
	} catch {
		return null;
	}
}

/**
 * Normalize the on-disk config into a providers-keyed map so downstream code
 * has a single shape to consume.
 *
 * Accepts three kinds of input simultaneously:
 * 1. Legacy flat config: `{ apiKey, model, baseUrl }` at the top level — promoted
 *    to `providers.zhipu` if that key isn't already declared.
 * 2. Modern multi-provider: `{ providers: { zhipu: {...}, ollama: {...} } }`.
 * 3. Mixed: top-level zhipu fields + an added `providers.ollama` block, which
 *    lets users add a second provider without restructuring their whole file.
 */
function normalizeProviders(file: ZRunFileConfig): Record<string, ProviderSettings> {
	const providers: Record<string, ProviderSettings> = { ...(file.providers ?? {}) };

	const hasFlatZhipuFields = Boolean(file.apiKey || file.model || file.baseUrl);
	if (hasFlatZhipuFields && !providers[ZHIPU_PROVIDER]) {
		providers[ZHIPU_PROVIDER] = {
			...(file.apiKey !== undefined && { apiKey: file.apiKey }),
			...(file.model !== undefined && { model: file.model }),
			...(file.baseUrl !== undefined && { baseUrl: file.baseUrl }),
		};
	}

	return providers;
}

/**
 * Decide which provider to activate for this run. Priority (highest first):
 *
 *   1. v2 backend selection (`--cli native` or `--cli ollama`)
 *   2. `NATIVE_PROVIDER` env var
 *   3. Inferred from `--model <name>` when the model is uniquely owned by one
 *      provider in the registry (so `--model llama3.2:latest` picks ollama without
 *      the user having to spell out `NATIVE_PROVIDER=ollama`)
 *   4. `defaultProvider` in ~/.aidd/config.json
 *   5. Fall back to 'zhipu'
 */
function resolveActiveProvider(
	cliProvider: string | undefined,
	cliModel: string | undefined,
	file: ZRunFileConfig
): string {
	if (cliProvider) return cliProvider;
	const env = process.env['ZRUN_PROVIDER'];
	if (env) return env;
	if (cliModel) {
		const inferred = inferProviderFromModel(cliModel);
		if (inferred) return inferred;
	}
	if (file.defaultProvider) return file.defaultProvider;
	return ZHIPU_PROVIDER;
}

export async function loadConfig(
	scriptDir: string,
	cliArgs: string[] = process.argv.slice(2)
): Promise<ZRunConfig> {
	/* Search order: local repo config → home directory config. First hit wins. */
	const candidates = [
		join(scriptDir, '..', 'config.json'),
		join(homedir(), '.zrun', 'config.json'),
	];

	let fileConfig: ZRunFileConfig = {};
	for (const path of candidates) {
		const cfg = loadJsonConfig(path);
		if (cfg) {
			fileConfig = cfg;
			break;
		}
	}

	const providersMap = normalizeProviders(fileConfig);
	const cliProvider = parseProviderArg(cliArgs);
	const cliModel = parseModelArg(cliArgs);
	const provider = resolveActiveProvider(cliProvider, cliModel, fileConfig);

	const providerConfig = getProvider(provider);
	if (!providerConfig) {
		console.error(
			`ERROR: Unknown provider '${provider}'. Available providers: ${getProviderNames().join(', ')}`
		);
		process.exit(1);
	}

	const userSettings = providersMap[provider] ?? {};

	/* CLI --model overrides provider config; provider config overrides provider defaults. */
	let model = cliModel ?? userSettings.model;
	let baseUrl = userSettings.baseUrl;
	let apiKey = userSettings.apiKey;

	if (providerConfig.apiKey === 'required' && !apiKey) {
		console.error(
			`ERROR: Provider '${provider}' requires an API key. Add it to providers.${provider}.apiKey in config.json.`
		);
		process.exit(1);
	}

	if (provider === OLLAMA_PROVIDER) {
		/* Strip a /v1 (with optional trailing slash) from user-provided baseUrl so the
		 * provider helper can reattach it consistently via getOpenAICompatibleUrl(). */
		const ollama = new OllamaProvider(baseUrl ? baseUrl.replace(/\/v1\/?$/, '') : undefined);

		if (!(await ollama.checkHealth())) {
			console.error('ERROR: Ollama server is not running. Start it with: ollama serve');
			process.exit(1);
		}

		/* Deterministic auto-selection when model is unset: prefer the provider's declared
		 * defaultModel if it's installed, else alphabetical-sorted first so repeat runs
		 * pick the same model. Ollama's /api/tags order is not guaranteed. */
		if (!model) {
			const models = await ollama.getAvailableModels();
			if (models.length === 0) {
				console.error(
					'ERROR: No models found in Ollama. Pull one with: ollama pull <model>'
				);
				process.exit(1);
			}
			const preferred = providerConfig.defaultModel;
			if (preferred && models.includes(preferred)) {
				model = preferred;
			} else {
				model = [...models].sort()[0];
			}
			console.warn(
				`WARNING: No model specified, using '${model}'. Set providers.${provider}.model in config.json to lock it in.`
			);
		}

		if (!baseUrl) {
			baseUrl = ollama.getOpenAICompatibleUrl();
		}
	} else {
		if (!model) model = providerConfig.defaultModel;
		if (!baseUrl) baseUrl = providerConfig.baseUrl;
		if (!model) {
			console.error(
				`ERROR: Provider '${provider}' has no default model and none was configured. Add providers.${provider}.model to config.json or pass --model.`
			);
			process.exit(1);
		}
	}

	return {
		provider,
		apiKey,
		model,
		baseUrl,
		maxTurns: fileConfig.maxTurns ?? DEFAULT_MAX_TURNS,
	};
}

export function parseModelArg(args: string[]): string | undefined {
	const idx = args.indexOf('--model');
	if (idx !== -1 && idx + 1 < args.length) {
		return args[idx + 1];
	}
	return undefined;
}

export function parseProviderArg(args: string[]): string | undefined {
	const idx = args.indexOf('--provider');
	if (idx !== -1 && idx + 1 < args.length) {
		return args[idx + 1];
	}
	return undefined;
}
