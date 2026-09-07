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
import { configSchema } from '../../shared/src/config/schema.ts';
import { backendNames } from '../../shared/src/plan/types.ts';

// spernakit enforces "an example file and the real thing agree on shape" with
// `check-secrets-shape`, which discovers pairs by globbing `config/*.secrets.json{,.example}`.
// aidd has no `config/` directory and no `*.secrets.json` of any kind, so that gate would print
// its no-pairs [SKIP] on every run in every checkout -- it does not port. The rule does apply:
// aidd ships an example file a user is told to copy, and it has a consumer that decides whether
// the copy actually works. Nothing checked it. This test does.
//
// The compose examples this file also covered are gone: aidd ships as source and no longer
// publishes a container image, so `compose.env.example` and `compose.vars.example` were removed
// along with the Dockerfile. `buildBackendSubprocessEnv`'s allowlist, which the compose assertions
// probed, keeps its coverage in `env-key-registry.test.ts`.
//
// `portable-gates-aidd-targets.json.example` is deliberately not covered. It is a roster of
// deliberately fictional repository names rather than a key template, so there is no shape to
// compare -- and its live counterpart holds private sibling repository names that must not be
// read into a tracked test.

const repoRoot = join(import.meta.dir, '..', '..');
const read = (name: string) => readFile(join(repoRoot, name), 'utf8');

async function readExample() {
	return configSchema.parse(JSON.parse(await read('config.json.example')));
}

function objectValue(value: unknown, path: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${path} must be an object in config.json.example`);
	}
	return value as Record<string, unknown>;
}

function expectObjectShape(value: unknown, shape: object, path: string): void {
	expect(Object.keys(objectValue(value, path)).sort()).toEqual(Object.keys(shape).sort());
}

describe('config.json.example is a config the schema would accept', () => {
	// The example is registered distributed material (scripts/lib/third-party-licenses/
	// distributed-paths.ts), so a user's first config is a copy of it. `configSchema` is
	// .strict() at every level, which makes this one assertion cover both drift directions: a key
	// the schema has since dropped fails as unrecognised, and a key the schema has since required
	// fails as missing.
	test('parses clean against the strict schema', async () => {
		const parsed = configSchema.safeParse(JSON.parse(await read('config.json.example')));

		const issues = parsed.success
			? []
			: parsed.error.issues.map(
					(issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
				);
		expect(issues).toEqual([]);
	});

	test('shows every accepted config path and every canonical backend/provider', async () => {
		const example = await readExample();
		expectObjectShape(example, configSchema.shape, '<root>');

		const backends = objectValue(example.backends, 'backends');
		expect(Object.keys(backends).sort()).toEqual([...backendNames].sort());
		const backendShape = configSchema.shape.backends.unwrap().valueType.shape;
		for (const backend of backendNames) {
			expectObjectShape(backends[backend], backendShape, `backends.${backend}`);
		}

		const providers = objectValue(example.providers, 'providers');
		expect(Object.keys(providers).sort()).toEqual(Object.keys(providerDefaults).sort());
		const representedProviderKeys = new Set(
			Object.entries(providers).flatMap(([provider, value]) =>
				Object.keys(objectValue(value, `providers.${provider}`)),
			),
		);
		expect([...representedProviderKeys].sort()).toEqual(
			Object.keys(configSchema.shape.providers.unwrap().valueType.shape).sort(),
		);

		const channels = objectValue(example.channels, 'channels');
		const channelShape = configSchema.shape.channels.unwrap().shape;
		expectObjectShape(channels, channelShape, 'channels');
		expectObjectShape(
			channels.telegram,
			channelShape.telegram.unwrap().shape,
			'channels.telegram',
		);

		const directAi = objectValue(example.directAi, 'directAi');
		const directAiShape = configSchema.shape.directAi.unwrap().shape;
		expectObjectShape(directAi, directAiShape, 'directAi');
		expectObjectShape(
			directAi.surfaces,
			directAiShape.surfaces.unwrap().shape,
			'directAi.surfaces',
		);

		const director = objectValue(example.director, 'director');
		const directorShape = configSchema.shape.director.unwrap().shape;
		expectObjectShape(director, directorShape, 'director');
		for (const key of ['chat', 'schedule', 'suggestions'] as const) {
			expectObjectShape(director[key], directorShape[key].unwrap().shape, `director.${key}`);
		}
		const suggestions = objectValue(director.suggestions, 'director.suggestions');
		expectObjectShape(
			suggestions.autoLaunch,
			directorShape.suggestions.unwrap().shape.autoLaunch.unwrap().shape,
			'director.suggestions.autoLaunch',
		);

		expectObjectShape(
			example.triumvirate,
			configSchema.shape.triumvirate.unwrap().shape,
			'triumvirate',
		);

		const web = objectValue(example.web, 'web');
		const webShape = configSchema.shape.web.unwrap().shape;
		expectObjectShape(web, webShape, 'web');
		const templates = example.web?.templates;
		if (!templates?.[0]) throw new Error('web.templates must show one complete entry');
		expectObjectShape(
			templates[0],
			webShape.templates.unwrap().element.shape,
			'web.templates[0]',
		);

		const sharedFileObject = example.sharedFiles?.find(
			(entry) => typeof entry === 'object' && entry !== null,
		);
		const sharedFileObjectSchema = configSchema.shape.sharedFiles.unwrap().element.options[1];
		expectObjectShape(sharedFileObject, sharedFileObjectSchema.shape, 'sharedFiles[object]');
	});

	test('keeps provider model examples aligned with runtime defaults', async () => {
		const example = await readExample();

		for (const [provider, defaults] of Object.entries(providerDefaults)) {
			expect(example.providers?.[provider]?.model).toBe(defaults.model);
			expect(example.providers?.[provider]?.baseUrl).toBe(defaults.baseUrl);
		}
	});

	test('uses runtime defaults wherever the schema can represent them', async () => {
		const example = await readExample();
		expect(example).toMatchObject({
			auditsEnabled: defaults.auditsEnabled,
			cli: defaults.cli,
			complexityTieredPlanning: false,
			consistencyGateEnabled: false,
			dirtyTreeThreshold: defaults.dirtyTreeThreshold,
			idleNudgeTimeoutSeconds: defaults.idleNudgeTimeoutSeconds,
			idleTimeoutSeconds: defaults.idleTimeoutSeconds,
			maxConsecutiveTimeoutRetries: defaults.maxConsecutiveTimeoutRetries,
			maxTurns: DEFAULT_AGENT_LOOP_MAX_TURNS,
			noClean: defaults.noClean,
			noWorkBackoffMs: defaults.noWorkBackoffMs,
			preflightDoctor: defaults.preflightDoctor,
			quitOnAbort: defaults.quitOnAbort,
			rateLimitBackoffSeconds: defaults.rateLimitBackoffSeconds,
			rateLimitBufferSeconds: defaults.rateLimitBufferSeconds,
			reasoningEffort: defaults.reasoningEffort,
			timeoutSeconds: defaults.timeoutSeconds,
		});

		for (const backend of backendNames) {
			expect(example.backends?.[backend]).toMatchObject({
				idleNudgeTimeoutSeconds: defaults.idleNudgeTimeoutSeconds,
				idleTimeoutSeconds: defaults.idleTimeoutSeconds,
				reasoningEffort: defaults.reasoningEffort,
				timeoutSeconds: defaults.timeoutSeconds,
			});
		}

		expect(example.directAi).toMatchObject({
			enabled: false,
			reasoningEffort: defaults.reasoningEffort,
			surfaces: {
				directorChat: false,
				directorCycle: false,
				projectAdvisor: false,
				runSummaries: false,
			},
			timeoutSeconds: defaultDirectAiTimeoutSeconds,
		});

		expect(example.director).toEqual({
			chat: { allowFileEdits: false },
			schedule: { enabled: false, intervalHours: defaultDirectorIntervalHours },
			suggestions: {
				autoLaunch: {
					allowedRecipes: [...defaultDirectorAutoLaunchAllowedRecipes],
					enabled: defaultDirectorAutoLaunchEnabled,
					maxPerCycle: defaultDirectorAutoLaunchMaxPerCycle,
					maxRank: defaultDirectorAutoLaunchMaxRank,
					riskCeiling: defaultDirectorAutoLaunchRiskCeiling,
				},
				granularity: defaultDirectorSuggestionGranularity,
				maxPerBucket: defaultDirectorMaxPerBucket,
			},
		});

		expect(example.web).toMatchObject({
			allowedOrigins: defaultWebConfig.allowedOrigins,
			allowRemote: defaultWebConfig.allowRemote,
			autoChainLimit: defaultWebConfig.autoChainLimit,
			autoChainRuns: defaultWebConfig.autoChainRuns,
			dataDir: 'data',
			hostname: defaultWebConfig.hostname,
			ignoredFolders: defaultWebConfig.ignoredFolders,
			maxConcurrentRuns: defaultWebConfig.maxConcurrentRuns,
			maxConcurrentRunsPerProject: defaultWebConfig.maxConcurrentRunsPerProject,
			port: defaultWebConfig.port,
			showSpernakitProject: defaultWebConfig.showSpernakitProject,
			spernakitTemplateRepo: defaultWebConfig.spernakitTemplateRepo,
			traceDataMovement: defaultWebConfig.traceDataMovement,
			useWorktrees: defaultWebConfig.useWorktrees,
		});

		for (const [provider, config] of Object.entries(example.providers ?? {})) {
			expect(config.reasoningEffort).toBe(defaults.reasoningEffort);
			expect(config.stream).toBe(provider !== 'lmstudio' && provider !== 'ollama');
			expect(config.streamIdleTimeoutMs).toBe(DEFAULT_STREAM_IDLE_TIMEOUT_MS);
		}
	});
});
