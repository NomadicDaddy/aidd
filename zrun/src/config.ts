import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ZRunConfig } from './types';

const DEFAULT_CONFIG: Omit<ZRunConfig, 'apiKey'> = {
	model: 'glm-5',
	baseUrl: 'https://api.z.ai/api/paas/v4',
	maxTurns: 50,
};

function loadJsonConfig(path: string): Partial<ZRunConfig> | null {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as Partial<ZRunConfig>;
	} catch {
		return null;
	}
}

export function loadConfig(scriptDir: string): ZRunConfig {
	// Search order: local config → home directory config
	const candidates = [
		join(scriptDir, '..', 'config.json'),
		join(homedir(), '.zrun', 'config.json'),
	];

	let fileConfig: Partial<ZRunConfig> = {};
	for (const path of candidates) {
		const cfg = loadJsonConfig(path);
		if (cfg) {
			fileConfig = cfg;
			break;
		}
	}

	const apiKey = fileConfig.apiKey;
	if (!apiKey) {
		console.error('ERROR: No API key found. Create config.json with "apiKey" field.');
		process.exit(1);
	}

	return {
		apiKey,
		model: fileConfig.model ?? DEFAULT_CONFIG.model,
		baseUrl: fileConfig.baseUrl ?? DEFAULT_CONFIG.baseUrl,
		maxTurns: fileConfig.maxTurns ?? DEFAULT_CONFIG.maxTurns,
	};
}

export function parseModelArg(args: string[]): string | undefined {
	const idx = args.indexOf('--model');
	if (idx !== -1 && idx + 1 < args.length) {
		return args[idx + 1];
	}
	return undefined;
}
