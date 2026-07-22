import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { z } from 'zod/v4';

import type { ParsedArgs } from '../args/index.ts';
import type { ResolvedConfig } from './types.ts';

import { isPersistedReasoningEffort } from '../args/constants.ts';
import { metadataPath } from '../metadata/paths.ts';
import { resolveMergedConfig, resolveProjectDirInput } from './resolve.ts';
import { configSchema, type PartialAiddConfig } from './schema.ts';

function mergeDirectAiConfig(
	base: PartialAiddConfig,
	next: PartialAiddConfig
): PartialAiddConfig['directAi'] {
	if (base.directAi === undefined && next.directAi === undefined) return undefined;
	return {
		...base.directAi,
		...next.directAi,
		surfaces: {
			...base.directAi?.surfaces,
			...next.directAi?.surfaces,
		},
	};
}

export function getUserConfigPath(): string {
	return metadataPath(homedir(), 'config.json');
}

export async function readConfig(path: string): Promise<PartialAiddConfig> {
	try {
		const raw = await readFile(path, 'utf8');
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Invalid JSON in aidd config ${path}: ${detail}. ` +
					'Check for unescaped backslashes in Windows paths — use "\\\\" or "/".',
				{ cause: error }
			);
		}
		const result = configSchema.safeParse(parsed);
		if (!result.success) {
			throw new Error(`Invalid aidd config ${path}:\n${z.prettifyError(result.error)}`);
		}
		return result.data;
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return {};
		}
		throw error;
	}
}

/**
 * Trust boundary between operator and repository configuration. Project `.aidd/aidd.config.json`
 * ships with the repo, so a cloned codebase controls it; keys that direct the CLI to copy files
 * on the operator's machine (sharedFiles/sharedDirs sources can be absolute paths — e.g. a key
 * under the user's home) must only ever come from the user config. Silently dropped, not an
 * error: an untrusted repo declaring them is exactly the case this exists to neutralize.
 */
export function restrictProjectConfig(config: PartialAiddConfig): PartialAiddConfig {
	if (config.sharedFiles === undefined && config.sharedDirs === undefined) return config;
	const { sharedDirs: _sharedDirs, sharedFiles: _sharedFiles, ...rest } = config;
	return rest;
}

export function applyConfig(base: PartialAiddConfig, next: PartialAiddConfig): PartialAiddConfig {
	const directAi = mergeDirectAiConfig(base, next);
	return {
		...base,
		...next,
		backends: {
			...base.backends,
			...next.backends,
		},
		...(directAi !== undefined ? { directAi } : {}),
		triumvirate: {
			...base.triumvirate,
			...next.triumvirate,
		},
		web: {
			...base.web,
			...next.web,
		},
	};
}

function pickCliOverrides(args: ParsedArgs): PartialAiddConfig {
	const overrides: PartialAiddConfig = {};
	if (args.cli !== undefined) overrides.cli = args.cli;
	if (args.model !== undefined) overrides.model = args.model;
	if (args.initModel !== undefined) overrides.initModel = args.initModel;
	if (args.codeModel !== undefined) overrides.codeModel = args.codeModel;
	if (args.auditModel !== undefined) overrides.auditModel = args.auditModel;
	if (args.reasoningEffort !== undefined && isPersistedReasoningEffort(args.reasoningEffort)) {
		overrides.reasoningEffort = args.reasoningEffort;
	}
	if (args.maxIterations !== undefined) overrides.maxIterations = args.maxIterations;
	if (args.maxCostUsd !== undefined) overrides.maxCostUsd = args.maxCostUsd;
	if (args.maxTokens !== undefined) overrides.maxTokens = args.maxTokens;
	if (args.timeoutSeconds !== undefined) overrides.timeoutSeconds = args.timeoutSeconds;
	if (args.idleTimeoutSeconds !== undefined)
		overrides.idleTimeoutSeconds = args.idleTimeoutSeconds;
	if (args.idleNudgeTimeoutSeconds !== undefined)
		overrides.idleNudgeTimeoutSeconds = args.idleNudgeTimeoutSeconds;
	if (args.dirtyTreeThreshold !== undefined)
		overrides.dirtyTreeThreshold = args.dirtyTreeThreshold;
	if (args.complexityTiering) overrides.complexityTieredPlanning = true;
	if (args.consistencyGate) overrides.consistencyGateEnabled = true;
	if (args.noWorkBackoffMs !== undefined) overrides.noWorkBackoffMs = args.noWorkBackoffMs;
	if (args.noClean) overrides.noClean = true;
	if (args.quitOnAbort !== undefined) overrides.quitOnAbort = args.quitOnAbort;
	if (args.webPort !== undefined) overrides.web = { port: args.webPort };
	return overrides;
}

export interface ResolveConfigOptions {
	applyCliOverrides?: boolean | undefined;
	baseDir?: string | undefined;
	userConfigPath?: string | undefined;
}

export async function resolveConfig(
	args: ParsedArgs,
	options: ResolveConfigOptions = {}
): Promise<ResolvedConfig> {
	const userConfig = await readConfig(options.userConfigPath ?? getUserConfigPath());
	const applicationsRoot = userConfig.applicationsRoot;
	const resolvedProjectDir = resolveProjectDirInput(args.projectDir, applicationsRoot);
	const projectConfigPath = resolvedProjectDir
		? metadataPath(resolvedProjectDir, 'aidd.config.json')
		: undefined;
	const projectConfig = restrictProjectConfig(
		projectConfigPath ? await readConfig(projectConfigPath) : {}
	);
	const cliOverrides = options.applyCliOverrides === false ? {} : pickCliOverrides(args);
	const merged = applyConfig(applyConfig(userConfig, projectConfig), cliOverrides);
	return resolveMergedConfig(merged, {
		applicationsRoot,
		baseDir: options.baseDir,
		modelOverride: options.applyCliOverrides === false ? undefined : args.model,
		resolvedProjectDir,
	});
}
