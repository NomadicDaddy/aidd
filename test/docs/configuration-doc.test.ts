import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { providerDefaults } from '../../shared/src/agent/client.ts';
import { DEFAULT_STREAM_IDLE_TIMEOUT_MS } from '../../shared/src/agent/client/stream.ts';
import { DEFAULT_AGENT_LOOP_MAX_TURNS } from '../../shared/src/agent/loop.ts';
import {
	defaultDirectAiTimeoutSeconds,
	defaultDirectorAutoLaunchAllowedRecipes,
	defaultDirectorAutoLaunchEnabled,
	defaultDirectorAutoLaunchMaxPerCycle,
	defaultDirectorAutoLaunchMaxRank,
	defaultDirectorAutoLaunchRiskCeiling,
	defaultDirectorIntervalHours,
	defaultDirectorMaxPerBucket,
	defaultDirectorSuggestionGranularity,
	defaults,
	defaultWebConfig,
} from '../../shared/src/config/defaults.ts';
import { resolveProjectTemplates } from '../../shared/src/config/resolve-templates.ts';
import { configSchema } from '../../shared/src/config/schema.ts';

const repoRoot = join(import.meta.dir, '..', '..');

function normalizedSegments(segments: string[]): string[] {
	const normalized = [...segments];
	if ((normalized[0] === 'backends' || normalized[0] === 'providers') && normalized[1]) {
		normalized[1] = `<${normalized[0] === 'backends' ? 'backend' : 'provider'}>`;
	}
	return normalized;
}

function formatPath(segments: string[]): string {
	return normalizedSegments(segments).reduce(
		(path, segment) => (segment === '[]' ? `${path}[]` : path ? `${path}.${segment}` : segment),
		'',
	);
}

function collectConfigPaths(
	value: unknown,
	segments: string[] = [],
	paths = new Set<string>(),
): Set<string> {
	if (Array.isArray(value)) {
		for (const entry of value) {
			if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
			const itemSegments = [...segments, '[]'];
			paths.add(formatPath(itemSegments));
			collectConfigPaths(entry, itemSegments, paths);
		}
		return paths;
	}
	if (typeof value !== 'object' || value === null) return paths;

	for (const [key, entry] of Object.entries(value)) {
		const entrySegments = [...segments, key];
		paths.add(formatPath(entrySegments));
		collectConfigPaths(entry, entrySegments, paths);
	}
	return paths;
}

function collectDocumentedDefaults(documentation: string): Record<string, string> {
	const documentedDefaults: Record<string, string> = {};
	let defaultColumn = -1;
	let pathColumn = -1;

	for (const line of documentation.split('\n')) {
		if (!line.startsWith('|')) {
			defaultColumn = -1;
			pathColumn = -1;
			continue;
		}

		const cells = line
			.slice(1, line.endsWith('|') ? -1 : undefined)
			.split('|')
			.map((cell) => cell.trim());
		const isHeader = ['Config path', 'Key', 'Provider'].includes(cells[0] ?? '');
		const headerDefaultColumn = isHeader
			? cells.findIndex((cell) => cell.startsWith('Default'))
			: -1;
		if (isHeader) {
			defaultColumn = headerDefaultColumn;
			pathColumn = 0;
			continue;
		}
		if (defaultColumn < 0 || cells.every((cell) => /^:?-+:?$/.test(cell))) continue;

		const path = /^`([^`]+)`$/.exec(cells[pathColumn] ?? '')?.[1];
		const documentedDefault = cells[defaultColumn];
		if (path && documentedDefault) documentedDefaults[path] = documentedDefault;
	}

	return documentedDefaults;
}

const code = (value: boolean | number | string): string => `\`${String(value)}\``;
const codeList = (values: readonly string[]): string => values.map(code).join(', ');

function expectedDocumentedDefaults(): Record<string, string> {
	const template = resolveProjectTemplates([{ initCommand: ['example'], name: 'example' }]).find(
		({ name }) => name === 'example',
	);
	if (!template) throw new Error('example project template did not resolve');

	return {
		applicationsRoot: 'none',
		auditModel: 'none',
		auditsEnabled: code(defaults.auditsEnabled ?? true),
		backends: 'none',
		channels: 'none',
		cli: code(defaults.cli),
		codeModel: 'none',
		complexityTieredPlanning: code(false),
		consistencyGateEnabled: code(false),
		defaultProvider: code('zhipu'),
		directAi: 'disabled',
		director: 'none',
		dirtyTreeThreshold: code(defaults.dirtyTreeThreshold),
		idleNudgeTimeoutSeconds: code(defaults.idleNudgeTimeoutSeconds),
		idleTimeoutSeconds: code(defaults.idleTimeoutSeconds),
		maxConsecutiveTimeoutRetries: code(defaults.maxConsecutiveTimeoutRetries),
		maxCostUsd: 'no budget',
		maxIterations: 'no limit',
		maxTokens: 'no budget',
		maxTurns: code(DEFAULT_AGENT_LOOP_MAX_TURNS),
		model: 'none',
		noClean: code(defaults.noClean),
		noWorkBackoffMs: code(defaults.noWorkBackoffMs),
		preflightDoctor: code(defaults.preflightDoctor ?? true),
		providers: 'none',
		quitOnAbort: code(defaults.quitOnAbort),
		rateLimitBackoffSeconds: code(defaults.rateLimitBackoffSeconds),
		rateLimitBufferSeconds: code(defaults.rateLimitBufferSeconds),
		reasoningEffort: code(defaults.reasoningEffort),
		sharedDirs: 'none',
		sharedFiles: 'none',
		timeoutSeconds: code(defaults.timeoutSeconds),
		triumvirate: 'none',
		web: 'see below',
		'backends.<backend>.idleNudgeTimeoutSeconds': `top-level value (${code(defaults.idleNudgeTimeoutSeconds)})`,
		'backends.<backend>.idleTimeoutSeconds': `top-level value (${code(defaults.idleTimeoutSeconds)})`,
		'backends.<backend>.model': 'normal model precedence',
		'backends.<backend>.reasoningEffort': `top-level value (${code(defaults.reasoningEffort)})`,
		'backends.<backend>.timeoutSeconds': `top-level value (${code(defaults.timeoutSeconds)})`,
		'providers.<provider>.apiKey': 'none',
		'providers.<provider>.baseUrl': 'provider-specific',
		'providers.<provider>.model': 'provider-specific',
		'providers.<provider>.reasoningEffort': `top-level value (${code(defaults.reasoningEffort)})`,
		'providers.<provider>.stream': 'remote `true`; local `false`',
		'providers.<provider>.streamIdleTimeoutMs': code(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
		...Object.fromEntries(
			Object.entries(providerDefaults).map(([provider, config]) => {
				if (!config.model) throw new Error(`${provider} has no default model`);
				return [provider, code(config.model)];
			}),
		),
		'directAi.baseUrl': 'selected provider',
		'directAi.enabled': code(false),
		'directAi.model': 'selected provider',
		'directAi.provider': code('defaultProvider'),
		'directAi.reasoningEffort': 'provider/top-level effort',
		'directAi.surfaces': 'follows `directAi.enabled`',
		'directAi.surfaces.directorChat': code('directAi.enabled'),
		'directAi.surfaces.directorCycle': code('directAi.enabled'),
		'directAi.surfaces.projectAdvisor': code('directAi.enabled'),
		'directAi.surfaces.runSummaries': code('directAi.enabled'),
		'directAi.timeoutSeconds': code(defaultDirectAiTimeoutSeconds),
		'director.chat': 'see child path',
		'director.chat.allowFileEdits': code(false),
		'director.schedule': 'see child paths',
		'director.schedule.enabled': code(false),
		'director.schedule.intervalHours': code(defaultDirectorIntervalHours),
		'director.suggestions': 'see child paths',
		'director.suggestions.autoLaunch': 'disabled',
		'director.suggestions.autoLaunch.allowedRecipes': codeList(
			defaultDirectorAutoLaunchAllowedRecipes,
		),
		'director.suggestions.autoLaunch.enabled': code(defaultDirectorAutoLaunchEnabled),
		'director.suggestions.autoLaunch.maxPerCycle': code(defaultDirectorAutoLaunchMaxPerCycle),
		'director.suggestions.autoLaunch.maxRank': code(defaultDirectorAutoLaunchMaxRank),
		'director.suggestions.autoLaunch.riskCeiling': code(defaultDirectorAutoLaunchRiskCeiling),
		'director.suggestions.granularity': code(defaultDirectorSuggestionGranularity),
		'director.suggestions.maxPerBucket': code(defaultDirectorMaxPerBucket),
		'triumvirate.execCli': 'overseer backend',
		'triumvirate.execModel': 'overseer model',
		'triumvirate.overseerCli': 'required at launch',
		'triumvirate.overseerModel': 'backend default',
		'triumvirate.secondaryCli': 'required at launch',
		'triumvirate.secondaryModel': 'backend default',
		'sharedFiles[]': 'none',
		'sharedFiles[].source': 'required for object entries',
		'sharedFiles[].target': 'source basename at root',
		'web.allowedOrigins': 'none',
		'web.allowedRoots': '`[applicationsRoot]` or parent runtime directory',
		'web.allowRemote': code(defaultWebConfig.allowRemote),
		'web.authToken': 'none',
		'web.autoChainLimit': code(defaultWebConfig.autoChainLimit),
		'web.autoChainRuns': code(defaultWebConfig.autoChainRuns),
		'web.dataDir': `${code('data')} under the runtime base directory`,
		'web.hostname': code(defaultWebConfig.hostname),
		'web.ignoredFolders': codeList(defaultWebConfig.ignoredFolders),
		'web.maxConcurrentRuns': code(defaultWebConfig.maxConcurrentRuns),
		'web.maxConcurrentRunsPerProject': code(defaultWebConfig.maxConcurrentRunsPerProject),
		'web.port': code(defaultWebConfig.port),
		'web.showSpernakitProject': code(defaultWebConfig.showSpernakitProject),
		'web.spernakitFleetManifest': 'none',
		'web.spernakitInitScript': 'none',
		'web.spernakitTemplateRef': 'none',
		'web.spernakitTemplateRepo': code(defaultWebConfig.spernakitTemplateRepo),
		'web.templates': 'none',
		'web.traceDataMovement': code(defaultWebConfig.traceDataMovement),
		'web.useWorktrees': code(defaultWebConfig.useWorktrees),
		'web.templates[].cwd': code(template.cwd),
		'web.templates[].description': code('name'),
		'web.templates[].initCommand': 'required',
		'web.templates[].name': 'required',
		'web.templates[].postCreate': code(template.postCreate),
		'web.templates[].requiresDescription': code(template.requiresDescription),
		'web.templates[].rootMustBeInitDir': code(template.rootMustBeInitDir),
	};
}

describe('configuration reference coverage', () => {
	test('documents every config path represented by the exhaustive example', async () => {
		const [documentation, exampleSource] = await Promise.all([
			readFile(join(repoRoot, 'docs', 'reference', 'configuration.md'), 'utf8'),
			readFile(join(repoRoot, 'config.json.example'), 'utf8'),
		]);
		const example = configSchema.parse(JSON.parse(exampleSource));
		const missing = [...collectConfigPaths(example)]
			.filter((path) => !documentation.includes(`\`${path}\``))
			.sort();

		expect(missing).toEqual([]);
	});

	test('keeps every documented default aligned with runtime defaults', async () => {
		const documentation = await readFile(
			join(repoRoot, 'docs', 'reference', 'configuration.md'),
			'utf8',
		);

		expect(collectDocumentedDefaults(documentation)).toEqual(expectedDocumentedDefaults());
	});
});
