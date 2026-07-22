import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';
import {
	hasPackageScript,
	readProjectPackage,
} from '../../backend/src/services/appLauncher/shared.ts';
import { resolveLaunchCommands } from '../../backend/src/services/appLauncher/reconciliation.ts';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import type {
	ResolvedConfig,
	ResolvedProjectTemplateConfig,
	ResolvedWebConfig,
} from 'aidd-shared/config';
import type { BackendName } from 'aidd-shared/plan/types';
import type {
	DirectAiCompleteRequest,
	DirectAiRunner,
} from '../../backend/src/services/directAiService.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import { createProject } from '../../backend/src/services/project/create.ts';
import type { InitFailureRecord } from '../../backend/src/services/project/templateScaffold.ts';
import type { ProjectCreateInputDto, RunLaunchRequest } from '../../backend/src/types.ts';
import { degitClone } from 'aidd-shared/git/degit';

import { testTempDir } from '../_helpers/temp.ts';
interface WebConfigOverrides {
	allowedRoots: string[];
	dataDir: string;
	spernakitInitScript?: string | null;
	templates?: ResolvedProjectTemplateConfig[];
}

function webProjectConfig(overrides: WebConfigOverrides) {
	const script = overrides.spernakitInitScript ?? null;
	// Mirror resolveProjectTemplates: the spernakit template is always synthesized (with the
	// scripts/init.ts sentinel initCommand) unless an explicit override is provided, so `mode:
	// 'spernakit'` resolves to the built-in clone-then-init path exactly as in prod.
	const hasExplicitSpernakit = (overrides.templates ?? []).some((t) => t.name === 'spernakit');
	const templates: ResolvedProjectTemplateConfig[] = [
		...(overrides.templates ?? []),
		...(hasExplicitSpernakit
			? []
			: [
					{
						cwd: 'root' as const,
						description: 'Full Spernakit application.',
						initCommand: ['bun', 'scripts/init.ts'],
						name: 'spernakit',
						postCreate: 'coding-run' as const,
						requiresDescription: true,
						rootMustBeInitDir: false,
						validationCommand: 'bun run smoke:qc',
					},
				]),
	];
	return {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: overrides.allowedRoots,
		dataDir: overrides.dataDir,
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3210,
		spernakitFleetManifest: null,
		spernakitInitScript: script,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates,
		traceDataMovement: true,
	};
}

function fullConfig(
	web: ResolvedWebConfig,
	overrides: Partial<ResolvedConfig> = {}
): ResolvedConfig & { web: ResolvedWebConfig } {
	return {
		cli: 'native',
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low',
		timeoutSeconds: 3600,
		preflightDoctor: false,
		...overrides,
		web,
	};
}

function recordingLauncher() {
	const calls: RunLaunchRequest[] = [];
	const launch = async (request: RunLaunchRequest): Promise<{ id: string }> => {
		calls.push(request);
		return { id: 'run-test-1' };
	};
	return { calls, launch };
}

// These service tests run without a database; the path-keyed run purge is exercised separately in
// web-db-projects.test.ts against a real SQLite connection.
const noopPurge = async (): Promise<number> => 0;

function fakeBackend(
	reply: string,
	captured: PromptInput[] = [],
	filesModified: string[] = []
): CLIBackend {
	return {
		idleDefaults: { killMs: 5000, nudgeMs: 4000 },
		name: 'native',
		async *runPrompt(input: PromptInput): AsyncIterable<AgentEvent> {
			captured.push(input);
			yield { type: 'assistant_text', chunk: reply };
			yield { type: 'done', exitCode: 0, filesModified };
		},
	};
}

function directAiRunner(reply: string | null): { calls: string[]; runner: DirectAiRunner } {
	const calls: string[] = [];
	return {
		calls,
		runner: {
			async completeJson<T>() {
				if (reply === null) return null;
				return JSON.parse(reply) as T;
			},
			async completeText(request: DirectAiCompleteRequest) {
				calls.push(request.prompt);
				return reply;
			},
			isSurfaceEnabled() {
				return reply !== null;
			},
			resolveClientConfig() {
				return null;
			},
			resolveSurfaceMeta() {
				return null;
			},
			updateConfig() {},
		},
	};
}

// A stub portable generator (scripts/init.ts) for exercising the spernakit create path without the
// real template. Writes its argv to ARGS.json in the target so tests can assert ports/flags.
const STUB_INIT_OK = [
	"import { mkdirSync, writeFileSync } from 'node:fs';",
	"import { join } from 'node:path';",
	'const args = process.argv.slice(2);',
	"const target = args[args.indexOf('--target') + 1] ?? '';",
	"mkdirSync(join(target, '.aidd'), { recursive: true });",
	"writeFileSync(join(target, 'ARGS.json'), JSON.stringify(args));",
	"console.log('STUB_INIT_OK');",
].join('\n');

const STUB_INIT_FAIL = [
	"import { mkdirSync, writeFileSync } from 'node:fs';",
	"import { join } from 'node:path';",
	'const args = process.argv.slice(2);',
	"const target = args[args.indexOf('--target') + 1] ?? '';",
	'mkdirSync(target, { recursive: true });',
	"writeFileSync(join(target, 'partial.txt'), 'x');",
	"console.log('STUB_INIT_FAILED_ON_STDOUT');",
	"console.error('stderr noise line');",
	'process.exit(1);',
].join('\n');

// Build a stub spernakit checkout (dir with scripts/init.ts + a root init.ps1 marker) and return the
// marker path to use as web.spernakitInitScript.
async function stubSpernakitCheckout(checkoutDir: string, initBody: string): Promise<string> {
	await mkdir(join(checkoutDir, 'scripts'), { recursive: true });
	await writeFile(join(checkoutDir, 'scripts', 'init.ts'), initBody, 'utf8');
	const marker = join(checkoutDir, 'init.ps1');
	await writeFile(marker, '# marker', 'utf8');
	return marker;
}

describe('project create service', () => {
	test('fresh mode with text spec writes .aidd/spec.md and launches a coding run', async () => {
		const tmpDir = await testTempDir('aidd-create-fresh-text-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });

		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { calls, launch } = recordingLauncher();
		const input: ProjectCreateInputDto = {
			description: null,
			mode: 'fresh',
			name: 'demo-app',
			root,
			spec: { kind: 'text', value: 'Build a tiny CLI that prints hello.' },
		};

		const result = await service.createProject(input, launch, noopPurge);

		const targetPath = resolve(join(root, 'demo-app'));
		expect(result.path).toBe(targetPath);
		expect(result.mode).toBe('fresh');
		expect(result.runId).toBe('run-test-1');
		expect(result.stopBeforeImplementation).toBe(true);
		const specContents = await readFile(join(targetPath, '.aidd', 'spec.md'), 'utf8');
		expect(specContents).toBe('Build a tiny CLI that prints hello.');
		expect(calls).toHaveLength(1);
		expect(calls[0]?.mode).toBe('coding');
		expect(calls[0]?.projectDir).toBe(targetPath);
		expect(calls[0]?.initGitAfterScaffold).toBe(true);
		expect(calls[0]?.stopBeforeImplementation).toBe(true);
		expect(calls[0]?.specFile).toBeDefined();
	});

	test('fresh mode with path spec copies the referenced file into .aidd/spec.md', async () => {
		const tmpDir = await testTempDir('aidd-create-fresh-path-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const specPath = join(root, 'source-spec.md');
		await writeFile(specPath, 'Spec read from a file path.', 'utf8');

		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { calls, launch } = recordingLauncher();

		const result = await service.createProject(
			{
				description: null,
				mode: 'fresh',
				name: 'spec-path-app',
				root,
				spec: { kind: 'path', value: specPath },
				stopBeforeImplementation: false,
			},
			launch,
			noopPurge
		);

		const specContents = await readFile(join(result.path, '.aidd', 'spec.md'), 'utf8');
		expect(specContents).toBe('Spec read from a file path.');
		expect(calls[0]?.initGitAfterScaffold).toBe(true);
		expect(calls[0]?.specFile).toBe(resolve(specPath));
		expect(calls[0]?.stopBeforeImplementation).toBe(false);
		expect(result.stopBeforeImplementation).toBe(false);
	});

	test('fresh mode without spec creates the project directory but no .aidd/spec.md', async () => {
		const tmpDir = await testTempDir('aidd-create-fresh-nospec-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });

		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { calls, launch } = recordingLauncher();

		const result = await service.createProject(
			{ description: null, mode: 'fresh', name: 'bare-app', root, spec: null },
			launch,
			noopPurge
		);

		await expect(readFile(join(result.path, '.aidd', 'spec.md'), 'utf8')).rejects.toThrow();
		expect(calls[0]?.initGitAfterScaffold).toBe(true);
		expect(calls[0]?.specFile).toBeUndefined();
	});

	test('fresh-create project is launchable by contract: scaffold package.json carries a dev script', async () => {
		const tmpDir = await testTempDir('aidd-create-launchable-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });

		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { launch } = recordingLauncher();

		const result = await service.createProject(
			{ description: null, mode: 'fresh', name: 'launchable-app', root, spec: null },
			launch,
			noopPurge
		);

		// The CLI scaffolds the root package.json from scaffolding/package.json during the
		// initializer phase (cli/src/metadata/scaffold.ts copies it into the empty project).
		// Install that exact template file the same way copyMissingEntries does for a fresh
		// project so we assert the real contract: the seeded package.json is launchable.
		const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
		const template = await readFile(join(repoRoot, 'scaffolding', 'package.json'), 'utf8');
		await writeFile(join(result.path, 'package.json'), template, 'utf8');

		const pkg = await readProjectPackage(result.path);
		expect(pkg).not.toBeNull();
		expect(pkg ? hasPackageScript(pkg, 'dev') : false).toBe(true);

		const commands = await resolveLaunchCommands(result.path);
		expect(commands.kind).toBe('generic');
		expect(commands.start).toEqual(['bun', 'run', 'dev']);
	});

	test('createProject rejects when target directory already exists and is non-empty', async () => {
		const tmpDir = await testTempDir('aidd-create-non-empty-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		const target = join(root, 'existing');
		await mkdir(target, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		await writeFile(join(target, 'placeholder.txt'), 'x', 'utf8');

		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { launch } = recordingLauncher();

		await expect(
			service.createProject(
				{ description: null, mode: 'fresh', name: 'existing', root, spec: null },
				launch,
				noopPurge
			)
		).rejects.toThrow(/already exists and is not empty/);
	});

	test('createProject rejects invalid project names', async () => {
		const tmpDir = await testTempDir('aidd-create-bad-name-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });

		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { launch } = recordingLauncher();

		await expect(
			service.createProject(
				{
					description: null,
					mode: 'fresh',
					name: 'bad name with spaces',
					root,
					spec: null,
				},
				launch,
				noopPurge
			)
		).rejects.toThrow(/Project name must contain only/);
	});

	test('spernakit mode runs the portable generator with an allocated port pair', async () => {
		const tmpDir = await testTempDir('aidd-create-spernakit-ports-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		const checkout = join(tmpDir, 'spernakit');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const script = await stubSpernakitCheckout(checkout, STUB_INIT_OK);

		const service = new ProjectService(
			webProjectConfig({ allowedRoots: [root], dataDir, spernakitInitScript: script })
		);
		const { calls, launch } = recordingLauncher();

		const result = await service.createProject(
			{ description: 'ports app', mode: 'spernakit', name: 'ports-app', root, spec: null },
			launch,
			noopPurge
		);

		expect(result.mode).toBe('spernakit');
		expect(calls).toHaveLength(1);

		const targetPath = resolve(join(root, 'ports-app'));
		const args = JSON.parse(await readFile(join(targetPath, 'ARGS.json'), 'utf8')) as string[];
		const frontendPort = Number(args[args.indexOf('--frontend-port') + 1]);
		const backendPort = Number(args[args.indexOf('--backend-port') + 1]);
		expect(frontendPort).toBeGreaterThanOrEqual(3340);
		expect(backendPort).toBe(frontendPort + 1);
		// aidd verifies the target is empty first, so it must NOT license the generator to wipe it.
		expect(args).not.toContain('--force');
		expect(args[args.indexOf('--application') + 1]).toBe('ports-app');
	}, 15_000);

	test('spernakit mode inits its own git, persists a run-log, and defaults an empty description', async () => {
		const tmpDir = await testTempDir('aidd-create-spernakit-success-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		const checkout = join(tmpDir, 'spernakit');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const script = await stubSpernakitCheckout(checkout, STUB_INIT_OK);

		const service = new ProjectService(
			webProjectConfig({ allowedRoots: [root], dataDir, spernakitInitScript: script })
		);
		const { calls, launch } = recordingLauncher();

		// An all-whitespace description is allowed now — init.ts falls back to the app name.
		const result = await service.createProject(
			{ description: '   ', mode: 'spernakit', name: 'spernakit-app', root, spec: null },
			launch,
			noopPurge
		);

		expect(result.mode).toBe('spernakit');
		expect(calls).toHaveLength(1);
		// The generator owns git init, so aidd does not request a post-scaffold git init.
		expect(calls[0]?.initGitAfterScaffold).toBeUndefined();
		expect(calls[0]?.stopBeforeImplementation).toBe(true);

		const targetPath = resolve(join(root, 'spernakit-app'));
		const args = JSON.parse(await readFile(join(targetPath, 'ARGS.json'), 'utf8')) as string[];
		expect(args[args.indexOf('--description') + 1]).toBe('spernakit-app');

		// A successful init persists its full output to a run-log and leaves no quarantine behind.
		const logFiles = await readdir(join(dataDir, 'run-logs'));
		expect(
			logFiles.some((entry) => entry.startsWith('spernakit-init-') && entry.endsWith('.log'))
		).toBe(true);
		expect((await readdir(root)).some((entry) => entry.includes('.failed-'))).toBe(false);
	}, 15_000);

	test('third-party template create-then-ingest launches intake, not a coding run', async () => {
		const tmpDir = await testTempDir('aidd-create-template-ingest-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });

		// A template that clones into a pre-created targetPath (cwd 'targetPath') and
		// drops a marker, with postCreate 'ingest'.
		const template: ResolvedProjectTemplateConfig = {
			cwd: 'targetPath',
			description: 'Marker template',
			initCommand: [
				'pwsh',
				'-NoProfile',
				'-Command',
				'New-Item -ItemType File -Name scaffold.txt | Out-Null',
			],
			name: 'marker',
			postCreate: 'ingest',
			requiresDescription: false,
			rootMustBeInitDir: false,
			validationCommand: null,
		};

		const service = new ProjectService(
			webProjectConfig({ allowedRoots: [root], dataDir, templates: [template] })
		);
		const { calls, launch } = recordingLauncher();
		const intakeCalls: string[] = [];
		const launchIntake = async (projectDir: string): Promise<{ id: string }> => {
			intakeCalls.push(projectDir);
			return { id: 'intake-session-7' };
		};

		const result = await service.createProject(
			{
				description: null,
				mode: 'fresh',
				name: 'templated-app',
				root,
				spec: null,
				template: 'marker',
			},
			launch,
			noopPurge,
			launchIntake
		);

		const targetPath = resolve(join(root, 'templated-app'));
		expect(result.runId).toBeNull();
		expect(result.intakeSessionId).toBe('intake-session-7');
		expect(result.stopBeforeImplementation).toBe(true);
		expect(intakeCalls).toEqual([targetPath]);
		expect(calls).toHaveLength(0);
		expect(await readFile(join(targetPath, 'scaffold.txt'), 'utf8')).toBeDefined();
	});

	test('unknown template name is rejected', async () => {
		const tmpDir = await testTempDir('aidd-create-template-unknown-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { launch } = recordingLauncher();

		await expect(
			service.createProject(
				{ description: null, mode: 'fresh', name: 'x', root, spec: null, template: 'nope' },
				launch,
				noopPurge
			)
		).rejects.toThrow(/Unknown project template: nope/);
	});

	test('spernakit mode surfaces a clear error when the configured checkout has no generator', async () => {
		const tmpDir = await testTempDir('aidd-create-spernakit-nogen-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		const checkout = join(tmpDir, 'spernakit');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		await mkdir(checkout, { recursive: true });
		// A checkout with the init.ps1 marker but NO scripts/init.ts.
		const script = join(checkout, 'init.ps1');
		await writeFile(script, '# marker', 'utf8');

		const service = new ProjectService(
			webProjectConfig({ allowedRoots: [root], dataDir, spernakitInitScript: script })
		);
		const { calls, launch } = recordingLauncher();

		await expect(
			service.createProject(
				{ description: 'x', mode: 'spernakit', name: 'no-gen', root, spec: null },
				launch,
				noopPurge
			)
		).rejects.toThrow(/no scripts\/init\.ts/);
		expect(calls).toHaveLength(0);
	});

	test('spernakit init failure quarantines the partial folder, persists a log, and surfaces stdout', async () => {
		const tmpDir = await testTempDir('aidd-create-spernakit-fail-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		const checkout = join(tmpDir, 'spernakit');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		// The generator creates a partial tree, prints the real cause on stdout, emits stderr noise,
		// and exits non-zero — mirroring the format:check failure that printed on stdout in the field.
		const script = await stubSpernakitCheckout(checkout, STUB_INIT_FAIL);

		const service = new ProjectService(
			webProjectConfig({ allowedRoots: [root], dataDir, spernakitInitScript: script })
		);
		const { calls, launch } = recordingLauncher();

		await expect(
			service.createProject(
				{
					description: 'A failing spernakit app',
					mode: 'spernakit',
					name: 'fail-app',
					root,
					spec: null,
				},
				launch,
				noopPurge
			)
		).rejects.toThrow(/STUB_INIT_FAILED_ON_STDOUT/);

		// No run was launched for a failed init.
		expect(calls).toHaveLength(0);

		// The original target path was vacated (quarantined), not left as an orphaned tree.
		const targetPath = resolve(join(root, 'fail-app'));
		await expect(readdir(targetPath)).rejects.toThrow();

		// A sibling quarantine folder (<name>.failed-<ts>) holds the script-created partial output.
		const rootEntries = await readdir(root);
		const quarantined = rootEntries.find((entry) => entry.startsWith('fail-app.failed-'));
		expect(quarantined).toBeDefined();
		expect(await readdir(join(root, quarantined ?? ''))).toContain('partial.txt');

		// The full combined output was persisted to a run-log, with both streams captured.
		const logFiles = await readdir(join(dataDir, 'run-logs'));
		const initLog = logFiles.find(
			(entry) => entry.startsWith('spernakit-init-') && entry.endsWith('.log')
		);
		expect(initLog).toBeDefined();
		const logContents = await readFile(join(dataDir, 'run-logs', initLog ?? ''), 'utf8');
		expect(logContents).toContain('STUB_INIT_FAILED_ON_STDOUT');
		expect(logContents).toContain('stderr noise line');
		expect(logContents).toContain('exit code: 1');
	}, 15_000);

	test('templateUrl and template together are rejected', async () => {
		const tmpDir = await testTempDir('aidd-create-github-both-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { launch } = recordingLauncher();

		await expect(
			service.createProject(
				{
					description: null,
					mode: 'fresh',
					name: 'both-sources',
					root,
					spec: null,
					template: 'marker',
					templateUrl: 'owner/repo',
				},
				launch,
				noopPurge
			)
		).rejects.toThrow(/either a template name or a template URL/);
	});

	test('malformed templateUrl is rejected and nothing is created', async () => {
		const tmpDir = await testTempDir('aidd-create-github-bad-url-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { calls, launch } = recordingLauncher();

		await expect(
			service.createProject(
				{
					description: null,
					mode: 'fresh',
					name: 'bad-url',
					root,
					spec: null,
					templateUrl: 'https://gitlab.com/owner/repo',
				},
				launch,
				noopPurge
			)
		).rejects.toThrow(/Template URL must be a GitHub repository/);

		expect(calls).toHaveLength(0);
		const rootEntries = await readdir(root);
		expect(rootEntries).toHaveLength(0);
	});

	test('templateUrl create clones then launches intake, not a coding run', async () => {
		const tmpDir = await testTempDir('aidd-create-github-ingest-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { calls, launch } = recordingLauncher();
		const intakeCalls: string[] = [];
		const launchIntake = async (projectDir: string): Promise<{ id: string }> => {
			intakeCalls.push(projectDir);
			return { id: 'intake-session-9' };
		};
		const cloneCalls: Parameters<typeof degitClone>[0][] = [];
		const fakeClone: typeof degitClone = async (opts) => {
			cloneCalls.push(opts);
			await mkdir(opts.targetPath, { recursive: true });
			await writeFile(join(opts.targetPath, 'astro.config.mjs'), 'export default {}', 'utf8');
			return { code: 0, stderr: '', stdout: 'cloned' };
		};

		const result = await service.createProject(
			{
				description: null,
				mode: 'fresh',
				name: 'astro-portfolio',
				root,
				spec: null,
				templateUrl: 'https://github.com/Gothsec/Astro-portfolio#main',
			},
			launch,
			noopPurge,
			launchIntake,
			fakeClone
		);

		const targetPath = resolve(join(root, 'astro-portfolio'));
		expect(result.runId).toBeNull();
		expect(result.intakeSessionId).toBe('intake-session-9');
		expect(intakeCalls).toEqual([targetPath]);
		expect(calls).toHaveLength(0);
		// The clone receives the canonical constructed URL and the parsed ref — never raw input.
		expect(cloneCalls).toHaveLength(1);
		expect(cloneCalls[0]?.cloneUrl).toBe('https://github.com/Gothsec/Astro-portfolio.git');
		expect(cloneCalls[0]?.ref).toBe('main');
		expect(cloneCalls[0]?.targetPath).toBe(targetPath);
		expect(cloneCalls[0]?.baselineLabel).toBe('Astro-portfolio');
		expect(await readFile(join(targetPath, 'astro.config.mjs'), 'utf8')).toBe(
			'export default {}'
		);
	});

	test('templateUrl create commits the imported baseline as the git root with no untracked source', async () => {
		const tmpDir = await testTempDir('aidd-create-github-baseline-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });

		const git = async (
			cwd: string,
			args: string[]
		): Promise<{ code: number; stdout: string }> => {
			const proc = Bun.spawn(['git', ...args], {
				cwd,
				stderr: 'pipe',
				stdout: 'pipe',
				windowsHide: true,
			});
			const [stdout, code] = await Promise.all([
				new Response(proc.stdout).text(),
				proc.exited,
			]);
			return { code, stdout };
		};

		// A real on-disk template repo stands in for GitHub: the injected clone delegates to the
		// REAL degitClone and only swaps the network cloneUrl for the local fixture path, so the
		// whole clone → strip → init → baseline-commit path runs exactly as in production.
		const fixture = join(tmpDir, 'fixture');
		await mkdir(join(fixture, 'src'), { recursive: true });
		await writeFile(join(fixture, 'README.md'), '# Template\n', 'utf8');
		await writeFile(join(fixture, 'src', 'index.ts'), 'export const x = 1;\n', 'utf8');
		await git(fixture, ['init']);
		await git(fixture, ['add', '.']);
		await git(fixture, [
			'-c',
			'user.email=seed@example.invalid',
			'-c',
			'user.name=Seed',
			'commit',
			'-m',
			'seed',
		]);

		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));
		const { calls, launch } = recordingLauncher();
		const launchIntake = async (): Promise<{ id: string }> => ({ id: 'intake-baseline-1' });
		const clone: typeof degitClone = (opts) => degitClone({ ...opts, cloneUrl: fixture });

		const result = await service.createProject(
			{
				description: null,
				mode: 'fresh',
				name: 'portfolio',
				root,
				spec: null,
				templateUrl: 'https://github.com/Gothsec/Astro-portfolio',
			},
			launch,
			noopPurge,
			launchIntake,
			clone
		);

		const targetPath = resolve(join(root, 'portfolio'));
		expect(result.intakeSessionId).toBe('intake-baseline-1');
		expect(calls).toHaveLength(0);
		// The git root IS the imported baseline (labeled with the repo parsed from the URL),
		// so intake's .aidd commits land on top of a real root instead of an untracked tree.
		const log = await git(targetPath, ['log', '--reverse', '--format=%s']);
		expect(log.code).toBe(0);
		expect(log.stdout.trim()).toBe('chore: import Astro-portfolio template baseline');
		const revCount = await git(targetPath, ['rev-list', '--count', 'HEAD']);
		expect(revCount.stdout.trim()).toBe('1');
		// No cloned source file is left untracked for intake to trip over.
		const status = await git(targetPath, ['status', '--porcelain']);
		expect(status.code).toBe(0);
		expect(status.stdout.trim()).toBe('');
	});

	test('templateUrl clone failure quarantines partial output, persists a log, and records the init failure', async () => {
		const tmpDir = await testTempDir('aidd-create-github-fail-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const web = webProjectConfig({ allowedRoots: [root], dataDir });
		const { calls, launch } = recordingLauncher();
		const failureRecords: InitFailureRecord[] = [];
		const failingClone: typeof degitClone = async (opts) => {
			await mkdir(opts.targetPath, { recursive: true });
			await writeFile(join(opts.targetPath, 'partial.txt'), 'x', 'utf8');
			return { code: 128, stderr: 'fatal: repository not found', stdout: '' };
		};

		await expect(
			createProject(
				{ config: web },
				{
					description: null,
					mode: 'fresh',
					name: 'gone-repo',
					root,
					spec: null,
					templateUrl: 'owner/gone-repo#v2',
				},
				launch,
				noopPurge,
				undefined,
				async (record) => {
					failureRecords.push(record);
				},
				failingClone
			)
		).rejects.toThrow(/repository not found/);

		expect(calls).toHaveLength(0);

		// The original target path was vacated (quarantined) with the partial clone preserved.
		const targetPath = resolve(join(root, 'gone-repo'));
		await expect(readdir(targetPath)).rejects.toThrow();
		const rootEntries = await readdir(root);
		const quarantined = rootEntries.find((entry) => entry.startsWith('gone-repo.failed-'));
		expect(quarantined).toBeDefined();
		const quarantinedEntries = await readdir(join(root, quarantined ?? ''));
		expect(quarantinedEntries).toContain('partial.txt');

		// The failure stays visible in the fleet under the github pseudo-template name, and
		// keeps the parseable source (ref included) so the retry route can re-clone it.
		expect(failureRecords).toHaveLength(1);
		expect(failureRecords[0]?.template).toBe('github:owner/gone-repo');
		expect(failureRecords[0]?.templateUrl).toBe('owner/gone-repo#v2');
		expect(failureRecords[0]?.errorSummary).toContain('exit code 128');

		// The combined clone output was persisted to a run-log.
		const logFiles = await readdir(join(dataDir, 'run-logs'));
		const initLog = logFiles.find((entry) => entry.endsWith('.log'));
		expect(initLog).toBeDefined();
		const logContents = await readFile(join(dataDir, 'run-logs', initLog ?? ''), 'utf8');
		expect(logContents).toContain('repository not found');
	});

	test('recommendProjectMode throws when the advisor is not configured', async () => {
		const tmpDir = await testTempDir('aidd-recommend-no-advisor-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });

		const service = new ProjectService(webProjectConfig({ allowedRoots: [root], dataDir }));

		await expect(
			service.recommendProjectMode({
				name: 'whatever',
				spec: { kind: 'text', value: 'a small CLI utility' },
			})
		).rejects.toThrow(/Project advisor is not initialized/);
	});

	test('recommendProjectMode uses direct AI when the project advisor surface is enabled', async () => {
		const tmpDir = await testTempDir('aidd-recommend-direct-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const web = webProjectConfig({ allowedRoots: [root], dataDir });
		const service = new ProjectService(web);
		const direct = directAiRunner(
			'{"mode":"spernakit","reasoning":"This is a web app with backend needs."}'
		);
		service.setAdvisor({
			backendFactory: () => {
				throw new Error('backend should not launch');
			},
			directAiService: direct.runner,
			getFullConfig: () =>
				fullConfig(web, {
					directAi: {
						enabled: true,
						surfaces: {
							directorChat: false,
							directorCycle: false,
							projectAdvisor: true,
							runSummaries: false,
						},
						timeoutSeconds: 45,
					},
				}),
		});

		const result = await service.recommendProjectMode({
			name: 'web-app',
			spec: { kind: 'text', value: 'Dashboard with users and API.' },
		});

		expect(result.mode).toBe('spernakit');
		expect(result.reasoning).toContain('web app');
		expect(direct.calls).toHaveLength(1);
		expect(direct.calls[0]).toContain('Dashboard with users and API.');
	});

	test('recommendProjectMode falls back to monitored backend when direct AI is disabled', async () => {
		const tmpDir = await testTempDir('aidd-recommend-shell-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const web = webProjectConfig({ allowedRoots: [root], dataDir });
		const service = new ProjectService(web);
		const captured: PromptInput[] = [];
		const direct = directAiRunner(null);
		service.setAdvisor({
			backendFactory: (_name: BackendName) =>
				fakeBackend('{"mode":"fresh","reasoning":"A small CLI utility."}', captured),
			directAiService: direct.runner,
			getFullConfig: () => fullConfig(web),
		});

		const result = await service.recommendProjectMode({
			name: 'tiny-cli',
			spec: { kind: 'text', value: 'Small CLI utility.' },
		});

		expect(result.mode).toBe('fresh');
		expect(captured).toHaveLength(1);
		expect(captured[0]?.text).toContain('Small CLI utility.');
	});

	test('recommendProjectMode offers and accepts ingest when the target root/name is non-empty', async () => {
		const tmpDir = await testTempDir('aidd-recommend-ingest-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		const existing = join(root, 'legacy-app');
		await mkdir(existing, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		await writeFile(join(existing, 'index.ts'), 'console.log(1)', 'utf8');
		const web = webProjectConfig({ allowedRoots: [root], dataDir });
		const service = new ProjectService(web);
		const direct = directAiRunner(
			'{"mode":"ingest","reasoning":"Existing code is present; manage it as-is."}'
		);
		service.setAdvisor({
			backendFactory: () => {
				throw new Error('backend should not launch');
			},
			directAiService: direct.runner,
			getFullConfig: () =>
				fullConfig(web, {
					directAi: {
						enabled: true,
						surfaces: {
							directorChat: false,
							directorCycle: false,
							projectAdvisor: true,
							runSummaries: false,
						},
						timeoutSeconds: 45,
					},
				}),
		});

		const result = await service.recommendProjectMode({
			name: 'legacy-app',
			root,
			spec: { kind: 'text', value: 'Modernize this CLI.' },
		});

		expect(result.mode).toBe('ingest');
		expect(direct.calls[0]).toContain('"ingest"');
	});

	test('recommendProjectMode falls back to ingest (never fresh) on parse failure for a non-empty target', async () => {
		const tmpDir = await testTempDir('aidd-recommend-fallback-ingest-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		const existing = join(root, 'has-code');
		await mkdir(existing, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		await writeFile(join(existing, 'main.py'), 'print(1)', 'utf8');
		const web = webProjectConfig({ allowedRoots: [root], dataDir });
		const service = new ProjectService(web);
		const direct = directAiRunner('this is not json at all');
		service.setAdvisor({
			backendFactory: () => {
				throw new Error('backend should not launch');
			},
			directAiService: direct.runner,
			getFullConfig: () =>
				fullConfig(web, {
					directAi: {
						enabled: true,
						surfaces: {
							directorChat: false,
							directorCycle: false,
							projectAdvisor: true,
							runSummaries: false,
						},
						timeoutSeconds: 45,
					},
				}),
		});

		const result = await service.recommendProjectMode({
			name: 'has-code',
			root,
			spec: { kind: 'text', value: 'Something.' },
		});

		expect(result.mode).toBe('ingest');
	});

	test('recommendProjectMode ignores an ingest reply for an empty target and falls back to fresh', async () => {
		const tmpDir = await testTempDir('aidd-recommend-empty-');
		const root = join(tmpDir, 'root');
		const dataDir = join(tmpDir, 'data');
		await mkdir(root, { recursive: true });
		await mkdir(dataDir, { recursive: true });
		const web = webProjectConfig({ allowedRoots: [root], dataDir });
		const service = new ProjectService(web);
		// Model wrongly returns ingest though the target does not exist yet.
		const direct = directAiRunner('{"mode":"ingest","reasoning":"n/a"}');
		service.setAdvisor({
			backendFactory: () => {
				throw new Error('backend should not launch');
			},
			directAiService: direct.runner,
			getFullConfig: () =>
				fullConfig(web, {
					directAi: {
						enabled: true,
						surfaces: {
							directorChat: false,
							directorCycle: false,
							projectAdvisor: true,
							runSummaries: false,
						},
						timeoutSeconds: 45,
					},
				}),
		});

		const result = await service.recommendProjectMode({
			name: 'brand-new',
			root,
			spec: { kind: 'text', value: 'A fresh idea.' },
		});

		expect(result.mode).toBe('fresh');
		expect(direct.calls[0]).not.toContain('"ingest"');
	});
});
