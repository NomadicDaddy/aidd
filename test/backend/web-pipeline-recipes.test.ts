import { Database } from 'bun:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import type { WebSocketEvent } from 'aidd-shared/contracts/websocket';

import type { RecipeDefinition } from '../../frontend/src/api/types.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { createWebServer } from '../../backend/src/server.ts';
import { AppLauncherService } from '../../backend/src/services/appLauncher/launcher.ts';
import { DiaryService } from '../../backend/src/services/diaryService.ts';
import { DirectorService } from '../../backend/src/services/directorService.ts';
import { disabledDirectAiRunner } from '../../backend/src/services/directAiService.ts';
import { SkillService } from '../../backend/src/services/skillService.ts';
import { MetricsService } from '../../backend/src/services/metricsService.ts';
import { requestFromAiddCliStep } from '../../backend/src/services/pipeline/helpers.ts';
import { PipelineService } from '../../backend/src/services/pipelineService.ts';
import { ProjectInitFailureService } from '../../backend/src/services/project/initFailureService.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import { RecipeService } from '../../backend/src/services/recipeService.ts';
import { RunService } from '../../backend/src/services/runService.ts';
import { SettingsService } from '../../backend/src/services/settingsService.ts';
import { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import { TerminalSessionManager } from '../../backend/src/services/terminal/sessionManager.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';
import { toDrafts } from '../../frontend/src/pages/recipes/recipe-steps.ts';
import { heartbeatTerminator, writeFakeCliEntrypoint } from './_helpers/heartbeat-stub.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

function wait(ms: number): Promise<void> {
	return Bun.sleep(ms);
}

function makeConfig(web: ResolvedWebConfig): { web: ResolvedWebConfig } & ResolvedConfig {
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
		web,
	};
}

async function makeProject(root: string): Promise<string> {
	const projectDir = join(root, 'sample-project');
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await Bun.write(join(projectDir, '.aidd', 'spec.md'), '# Sample\n');
	return projectDir;
}

async function makeRoot(script = 'console.log("aidd step");\n'): Promise<string> {
	const rootDir = await testTempDir('aidd-pipeline-root-');
	await mkdir(join(rootDir, 'recipes'), { recursive: true });
	await writeFakeCliEntrypoint(rootDir, script);
	return rootDir;
}

function makeHarness(rootDir: string, workspace: string) {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	const web = {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [workspace],
		dataDir: join(workspace, 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3210,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: true,
	};
	const hub = new WebSocketHub();
	const projectService = new ProjectService(web);
	const recipeService = new RecipeService(rootDir);
	const { db, commands } = wrapWebDatabase(sqlite);
	const telemetryService = new TelemetryService({ commands, db });
	const runService = new RunService(
		makeConfig(web),
		db,
		commands,
		hub,
		projectService,
		rootDir,
		telemetryService,
	);
	const skillService = new SkillService({ rootDir });
	const pipelineService = new PipelineService({
		db,
		hub,
		skillService,
		projectService,
		recipeService,
		runService,
		telemetryService,
	});
	return { hub, pipelineService, recipeService, runService, sqlite };
}

async function disposeHarness(
	pipelineService: PipelineService,
	runService: RunService,
	sqlite: Database,
): Promise<void> {
	// Stop scheduled timers and signal in-flight async work to wind down. We do not await
	// in-flight pipeline executions here — both PipelineService background executions and
	// RunService monitor promises now swallow post-close DB rejections at their own catch
	// boundaries, so closing the handle immediately is safe.
	runService.markDisposed();
	await pipelineService.signalStopAll();
	sqlite.close();
}

function makeServerHarness(rootDir: string, workspace: string) {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	const web = {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [workspace],
		dataDir: join(workspace, 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3210,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: true,
	};
	const config = makeConfig(web);
	const { db, commands } = wrapWebDatabase(sqlite);
	const database = {
		commands,
		db,
		path: ':memory:',
		sqlite,
		close: async (): Promise<void> => {
			sqlite.close();
		},
	};
	const hub = new WebSocketHub();
	const projectService = new ProjectService(web);
	const recipeService = new RecipeService(rootDir);
	const telemetryService = new TelemetryService({ commands, db });
	const metricsService = new MetricsService({
		dataDir: web.dataDir,
		db,
		getActiveConnections: () => hub.peerCount,
	});
	const runService = new RunService(
		config,
		db,
		commands,
		hub,
		projectService,
		rootDir,
		telemetryService,
	);
	const skillService = new SkillService({ rootDir });
	const pipelineService = new PipelineService({
		db,
		hub,
		skillService,
		projectService,
		recipeService,
		runService,
		telemetryService,
	});
	const directorService = new DirectorService(
		config,
		db,
		commands,
		hub,
		projectService,
		runService,
	);
	const appLauncherService = new AppLauncherService({ db, projectService });
	const diaryService = new DiaryService({ commands, db, projectService, rootDir });
	const app = createWebServer({
		appLauncherService,
		config,
		diaryService,
		directorService,
		database,
		directAiService: disabledDirectAiRunner,
		initFailureService: new ProjectInitFailureService(db),
		skillService,
		metricsService,
		pipelineService,
		projectService,
		recipeService,
		rootDir,
		runService,
		settingsService: new SettingsService(config, join(workspace, 'user-config.json')),
		telemetryService,
		terminalSessionManager: new TerminalSessionManager({
			listShells: () => [],
			rootDir,
			spawnPty: null,
		}),
		webSocketHub: hub,
	});
	return { app, pipelineService, recipeService, runService, sqlite };
}

async function waitForReport(
	service: PipelineService,
	id: string,
	statuses = new Set(['completed', 'completed_with_failures', 'failed', 'stopped']),
) {
	const startedAt = Date.now();
	for (;;) {
		const report = await service.getReport(id);
		if (report && statuses.has(report.session.status)) return report;
		// Eight parallel workers each spawn their own children, so a pipeline that finishes in
		// well under a second alone can take several seconds under a saturated suite. The bound
		// stays below Bun's 15s parallel-run ceiling so a genuinely stuck pipeline still reports
		// this message rather than an anonymous harness timeout.
		if (Date.now() - startedAt > 12_000) throw new Error('Timed out waiting for pipeline');
		await wait(25);
	}
}

describe('file-backed pipeline recipes', () => {
	test('copied aidd-web recipe inventory parses as multi-step recipes', async () => {
		const recipeService = new RecipeService(process.cwd());
		const recipes = await recipeService.listRecipes();
		const stepTypes = new Set(
			recipes.flatMap((recipe) => recipe.steps.map((step) => step.stepType)),
		);
		const recipeIds = new Set(recipes.map((recipe) => recipe.id));
		const skillOnlyIds = [
			'audit-finding-review',
			'coderabbit',
			'coderabbit-pr',
			'dance',
			'deepreview',
			'doc2feature',
			'feature-review',
			'grill-with-docs-init-existing',
			'hygiene',
			'knip',
			'test-application',
			'validate-build',
			'validate-tests',
		];

		expect(recipes).toHaveLength(35);
		expect(recipeIds.has('frontend-polish')).toBe(true);
		expect(recipeIds.has('interview-postq')).toBe(false);
		expect(recipeIds.has('reconcile-project-artifacts')).toBe(true);
		expect(skillOnlyIds.filter((id) => recipeIds.has(id))).toEqual([]);
		expect(stepTypes).toEqual(new Set(['aidd-cli', 'recipe-ref', 'shell', 'skill']));
		expect(recipes.every((recipe) => recipe.id.length > 0 && recipe.steps.length > 0)).toBe(
			true,
		);
	});

	test('project-intake parks open generated features after audit review, before the report', async () => {
		const recipeService = new RecipeService(process.cwd());
		const intake = await recipeService.readRecipe('project-intake');
		const names = intake.steps.map((step) => step.name);
		const parkIndex = names.indexOf('Park features for approval');
		// The finding review lives inside the `audit (all)` sub-recipe, not in project-intake's own
		// step list, so anchor on the step that delegates to it. Naming the inner step here made
		// indexOf return -1 and the ordering assertion pass for any position at all.
		const auditIndex = names.indexOf('Run audits');
		const reportIndex = names.indexOf('Intake report');

		expect(parkIndex).toBeGreaterThan(-1);
		expect(auditIndex).toBeGreaterThan(-1);
		expect(reportIndex).toBeGreaterThan(-1);
		expect(intake.steps[auditIndex]?.configJson.recipeName).toBe('audit (all)');
		expect(parkIndex).toBeGreaterThan(auditIndex);
		expect(parkIndex).toBeLessThan(reportIndex);
		const park = intake.steps[parkIndex];
		expect(park?.stepType).toBe('aidd-cli');
		const prompt = String(park?.configJson.prompt ?? '');
		expect(prompt).toContain("'waiting_approval'");
		expect(prompt).toContain("'backlog' or 'in_progress'");
		expect(prompt).toContain('Write nothing outside .aidd/');
	});

	test('artifact reconciliation uses the complete catalog refresh skill before status checks', async () => {
		const recipeService = new RecipeService(process.cwd());
		const recipe = await recipeService.readRecipe('reconcile-project-artifacts');
		const refreshStep = recipe.steps[0];

		expect(refreshStep?.stepType).toBe('skill');
		expect(refreshStep?.configJson).toMatchObject({
			args: '{application}',
			executionIntent: 'apply-changes',
			skillId: 'refresh-project-artifacts',
		});
		expect(recipe.steps[1]?.configJson.recipeName).toBe('check-artifacts');
	});

	test('apply-ui refuses to clobber an existing reference worktree and cleans up in a post-hook', async () => {
		const recipeService = new RecipeService(process.cwd());
		const recipe = await recipeService.readRecipe('apply-ui');

		expect(recipe.metadataOnly ?? false).toBe(false);
		expect(recipe.steps.map((step) => step.stepType)).toEqual([
			'shell',
			'skill',
			'skill',
			'skill',
			'aidd-cli',
		]);
		expect(recipe.steps.map((step) => step.configJson.skillId ?? null)).toEqual([
			null,
			'spernakit-apply-ui',
			'ui-parity',
			'feature-review',
			null,
		]);

		// The snapshot step must refuse on conflict, never repair by deleting: the
		// existing path may be an unrelated worktree the operator still needs.
		const snapshot = String(recipe.steps[0]?.configJson.command ?? '');
		expect(snapshot).toContain(
			'refusing to run apply-ui: working tree has uncommitted changes',
		);
		expect(snapshot).toContain('.worktrees/ui-reference already exists');
		expect(snapshot).toContain('git worktree add --detach .worktrees/ui-reference HEAD');
		expect(snapshot).not.toContain('rm -rf');

		// stepExecutor skips every later step once one fails, so cleanup cannot be a
		// trailing step; postHookJson is the only hook that runs unconditionally.
		const parity = recipe.steps[2];
		expect(String(parity?.configJson.args ?? '')).toBe('.worktrees/ui-reference .');
		expect(String(parity?.postHookJson?.command ?? '')).toContain(
			'git worktree remove --force .worktrees/ui-reference',
		);
		expect(
			recipe.steps
				.slice(3)
				.some((step) =>
					String(step.configJson.command ?? '').includes('git worktree remove'),
				),
		).toBe(false);
	});

	test('audit-maintenance stays writable outside .aidd so audit-review can emit its report', async () => {
		const recipeService = new RecipeService(process.cwd());
		const recipe = await recipeService.readRecipe('audit-maintenance');

		// audit-review writes <aidd-root>/audits/<name>.md, which the metadata-only
		// write guard ('.aidd' allowlist) would revert and then fail the step on.
		expect(recipe.metadataOnly ?? false).toBe(false);
		expect(recipe.steps.map((step) => step.configJson.skillId)).toEqual([
			'update-audits',
			'audit-review',
		]);
		expect(
			recipe.steps.every((step) => step.configJson.executionIntent === 'apply-changes'),
		).toBe(true);
	});

	test('ship-changes validates before it commits and never continues past a failure', async () => {
		const recipeService = new RecipeService(process.cwd());
		const recipe = await recipeService.readRecipe('ship-changes');
		const skillIds = recipe.steps.map((step) => step.configJson.skillId);

		expect(skillIds).toEqual([
			'validate-build',
			'validate-tests',
			'document-changes',
			'ship-pr',
		]);
		expect(recipe.steps.every((step) => step.onFailure === undefined)).toBe(true);
	});

	test('spernakit-dance stops when doc alignment fails, before The Dance pushes', async () => {
		const recipeService = new RecipeService(process.cwd());
		const recipe = await recipeService.readRecipe('spernakit-dance');
		const [align, dance] = recipe.steps;

		expect(recipe.steps).toHaveLength(2);
		expect(align?.configJson.skillId).toBe('spernakit-update-docs');
		expect(dance?.configJson.skillId).toBe('spernakit-dance');
		// The dance skill commits, tags, and pushes the template and derived apps, so a
		// failed prerequisite must abort rather than release.
		expect(align?.onFailure).toBeUndefined();
	});

	test('test recipes use the general tester unless their workflow is Spernakit-specific', async () => {
		const recipeService = new RecipeService(process.cwd());
		const genericRecipeIds = [
			'test-and-remediate',
			'test-application-chaos',
			'test-application-scenarios',
		];
		const spernakitRecipeIds = ['spernakit-bump', 'spernakit-propagate'];

		for (const recipeId of genericRecipeIds) {
			const recipe = await recipeService.readRecipe(recipeId);
			expect(recipe.steps.some((step) => step.configJson.skillId === 'tester')).toBe(true);
			expect(
				recipe.steps.some((step) => step.configJson.skillId === 'spernakit-tester'),
			).toBe(false);
		}
		for (const recipeId of spernakitRecipeIds) {
			const recipe = await recipeService.readRecipe(recipeId);
			expect(
				recipe.steps.some((step) => step.configJson.skillId === 'spernakit-tester'),
			).toBe(true);
		}
	});

	test('deploy re-checks the working tree after validation so the deployed tree matches a tag', async () => {
		const recipeService = new RecipeService(process.cwd());
		const recipe = await recipeService.readRecipe('deploy');
		const names = recipe.steps.map((step) => step.name);
		const recheckIndex = names.indexOf('Re-check the working tree');

		expect(recheckIndex).toBeGreaterThan(names.indexOf('Validate tests'));
		expect(recheckIndex).toBeLessThan(names.indexOf('Deploy'));
		const recheck = recipe.steps[recheckIndex];
		expect(recheck?.stepType).toBe('shell');
		expect(recheck?.onFailure).toBeUndefined();
		expect(String(recheck?.configJson.command ?? '')).toContain('refusing to deploy');
	});

	test('documentation and implementation recipes stop on the failures that would poison a commit', async () => {
		const recipeService = new RecipeService(process.cwd());
		const docs = await recipeService.readRecipe('update-application-documentation');
		const review = docs.steps.find(
			(step) => step.configJson.skillId === 'review-or-create-doc',
		);
		const humanize = docs.steps.find((step) => step.configJson.skillId === 'humanize-docs');

		// Review every file, but require a diff only where a correction or prose edit is needed.
		expect(review?.configJson.executionIntent).toBe('apply-changes');
		expect(String(review?.configJson.args ?? '')).toContain('correct every inaccuracy');
		expect(review?.onFailure).toBeUndefined();
		expect(String(humanize?.configJson.args ?? '')).toContain('in place');
		expect(humanize?.configJson.executionIntent).toBe('apply-changes');
		expect(humanize?.onFailure).toBeUndefined();
		expect(String(humanize?.configJson.args ?? '')).toContain('review every Markdown file');
		expect(String(humanize?.configJson.args ?? '')).toContain(
			'Leave effective prose unchanged',
		);
		expect(String(humanize?.configJson.args ?? '')).not.toContain('rewrite every Markdown');

		const newApp = await recipeService.readRecipe('new-app-from-idea');
		const validators = newApp.steps.filter((step) =>
			['validate-build', 'validate-tests'].includes(String(step.configJson.skillId ?? '')),
		);
		expect(validators).toHaveLength(2);
		expect(validators.every((step) => step.onFailure === undefined)).toBe(true);
	});

	test('runs a successful shell step with parameter substitution in the project directory', async () => {
		const workspace = await testTempDir('aidd-pipeline-shell-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'write_file',
					name: 'Write File',
					parameters: [{ defaultValue: 'hello', name: 'message' }],
					steps: [
						{
							configJson: {
								command: 'printf "{message}" > pipeline-output.txt',
							},
							id: 'write_file_step_1',
							name: 'Write output',
							stepType: 'shell',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					parameters: {},
					projectDir,
					recipeId: 'write_file',
				});
				const report = await waitForReport(pipelineService, session.id);

				expect(report.session.status).toBe('completed');
				expect(report.session.recipeSha256).toMatch(/^[a-f0-9]{64}$/);
				expect(report.stepResults[0]?.stepDefinitionId).toBe('write_file_step_1');
				expect(report.stepResults[0]?.outputSummary).toBe('');
				expect(await readFile(join(projectDir, 'pipeline-output.txt'), 'utf8')).toBe(
					'hello',
				);
				// The session-metrics dump is written under .aidd/runtime at session end so
				// report steps can read per-step timings without DB access. Asserted as a
				// literal path, not via the path helper, so a relocation has to be a
				// deliberate edit here rather than something the helper hides.
				const dump = JSON.parse(
					await readFile(
						join(
							projectDir,
							'.aidd',
							'runtime',
							'pipeline-sessions',
							session.id,
							'metrics.json',
						),
						'utf8',
					),
				) as { status: string; steps: { name: string }[] };
				expect(dump.status).toBe('completed');
				expect(dump.steps.some((step) => step.name === 'Write output')).toBe(true);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('session metrics dump is refreshed between steps so an in-session step can read prior steps', async () => {
		const workspace = await testTempDir('aidd-pipeline-midsession-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'capture_dump',
					name: 'Capture Dump',
					parameters: [],
					steps: [
						{
							configJson: { command: 'printf "one" > out1.txt' },
							id: 'capture_dump_step_1',
							name: 'First step',
							stepType: 'shell',
						},
						{
							// Reads the dump that the executor refreshed after step 1, proving an
							// in-session step can see prior steps' metrics. Addressed through
							// the reserved {sessionMetricsPath} parameter rather than a glob,
							// which also covers that substitution reaching a shell step.
							configJson: {
								command: 'cp {sessionMetricsPath} captured.json',
							},
							id: 'capture_dump_step_2',
							name: 'Capture step',
							stepType: 'shell',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					parameters: {},
					projectDir,
					recipeId: 'capture_dump',
				});
				const report = await waitForReport(pipelineService, session.id);
				expect(report.session.status).toBe('completed');

				// captured.json is the dump as it stood while step 2 ran: step 1 present and
				// still 'running' (the terminal dump comes only at session end).
				const captured = JSON.parse(
					await readFile(join(projectDir, 'captured.json'), 'utf8'),
				) as { status: string; steps: { name: string }[] };
				expect(captured.status).toBe('running');
				expect(captured.steps.some((step) => step.name === 'First step')).toBe(true);
				expect(captured.steps.some((step) => step.name === 'Capture step')).toBe(false);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('reserved session parameters beat a same-named recipe parameter', async () => {
		const workspace = await testTempDir('aidd-pipeline-reserved-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'reserved_params',
					name: 'Reserved Params',
					// A recipe parameter that collides with a reserved name. The reserved value
					// must win: a step reporting on the session has to read the session's real
					// metrics, not a path its caller supplied.
					parameters: [{ defaultValue: 'decoy.json', name: 'sessionMetricsPath' }],
					steps: [
						{
							configJson: { command: 'echo {sessionMetricsPath} > resolved.txt' },
							id: 'reserved_params_step_1',
							name: 'Echo path',
							stepType: 'shell',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					parameters: { sessionMetricsPath: 'decoy.json' },
					projectDir,
					recipeId: 'reserved_params',
				});
				const report = await waitForReport(pipelineService, session.id);
				expect(report.session.status).toBe('completed');

				const resolved = (await readFile(join(projectDir, 'resolved.txt'), 'utf8')).trim();
				expect(resolved).toBe(`.aidd/runtime/pipeline-sessions/${session.id}/metrics.json`);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('runs skill step through the aidd-local skill catalog', async () => {
		const workspace = await testTempDir('aidd-pipeline-skill-');
		// The backend forwards the skill identity (--skill/--skill-args); the real CLI compiles the
		// directive and stages contracts. This fake CLI captures the forwarded identity to prove the
		// backend no longer pre-compiles a --prompt for skill steps.
		const rootDir = await makeRoot(`
const projectDir = process.argv[process.argv.indexOf('--project-dir') + 1];
const flagValue = (name) => {
	const inline = process.argv.find((token) => token.startsWith(name + '='));
	if (inline !== undefined) return inline.slice(name.length + 1);
	const idx = process.argv.indexOf(name);
	return idx >= 0 ? process.argv[idx + 1] : '';
};
const skill = flagValue('--skill');
const skillArgs = flagValue('--skill-args');
const hasPrompt = process.argv.some((t) => t === '--prompt' || t.startsWith('--prompt='));
const hasReadonly = process.argv.includes('--directive-readonly');
await Bun.write(projectDir + '/skill-invocation.txt', skill + ' :: ' + skillArgs + ' :: prompt=' + hasPrompt + ' :: readonly=' + hasReadonly);
${heartbeatTerminator()}
`);
		try {
			await mkdir(join(rootDir, 'skills', 'demo-skill', 'templates'), {
				recursive: true,
			});
			await Bun.write(
				join(rootDir, 'skills', 'demo-skill', 'SKILL.md'),
				'---\nname: demo-skill\ndescription: Demo skill.\nmetadata:\n  aidd-category: runtime\n---\n\n# Demo Skill\n\nUse `$ARGUMENTS`.\n',
			);
			await Bun.write(join(rootDir, 'skills', 'demo-skill', 'templates', 'one.md'), 'one');
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'skill_recipe',
					name: 'Skill Recipe',
					parameters: [{ defaultValue: 'sample', name: 'message' }],
					steps: [
						{
							configJson: {
								args: '{message}',
								executionIntent: 'review-only',
								skillId: 'demo-skill',
							},
							id: 'skill_recipe_step_1',
							name: 'Run skill',
							stepType: 'skill',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					parameters: {},
					projectDir,
					recipeId: 'skill_recipe',
				});
				const report = await waitForReport(pipelineService, session.id);

				expect(report.session.status).toBe('completed');
				expect(report.stepResults[0]?.runId).toMatch(/^run_/);
				expect(report.stepResults[0]?.stepDefinitionId).toBe('skill_recipe_step_1');
				const invocation = await readFile(join(projectDir, 'skill-invocation.txt'), 'utf8');
				expect(invocation).toContain('demo-skill');
				expect(invocation).toContain('sample');
				// The backend forwards identity, not a pre-compiled prompt.
				expect(invocation).toContain('prompt=false');
				expect(invocation).toContain('readonly=true');

				const invocations = sqlite
					.query<
						{
							parent_invocation_id: null | string;
							resource_sha256: null | string;
							resource_type: string;
							source: string;
						},
						[]
					>(
						'SELECT resource_type, resource_sha256, source, parent_invocation_id FROM invocation_events ORDER BY started_at',
					)
					.all();
				const nested = invocations.find((row) => row.resource_type === 'skill');
				expect(nested?.source).toBe('recipe-step');
				expect(nested?.parent_invocation_id).not.toBeNull();
				expect(nested?.resource_sha256).toMatch(/^[a-f0-9]{64}$/);
				const managedRun = sqlite
					.query<
						{
							driver_id: null | string;
							driver_kind: null | string;
							driver_sha256: null | string;
						},
						[string]
					>('SELECT driver_id, driver_kind, driver_sha256 FROM runs WHERE id = ?')
					.get(report.stepResults[0]?.runId ?? '');
				expect(managedRun?.driver_id).toBe('skill_recipe_step_1');
				expect(managedRun?.driver_kind).toBe('recipe-step');
				expect(managedRun?.driver_sha256).toMatch(/^[a-f0-9]{64}$/);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('rejects a recipe skill step without an explicit execution intent', async () => {
		const rootDir = await testTempDir('aidd-pipeline-skill-intent-');
		try {
			const recipeService = new RecipeService(rootDir);
			await expect(
				recipeService.writeRecipe({
					id: 'missing_skill_intent',
					name: 'Missing skill intent',
					parameters: [],
					steps: [
						{
							configJson: { skillId: 'demo-skill' },
							id: 'missing_skill_intent_step_1',
							name: 'Run skill',
							stepType: 'skill',
						},
					],
				}),
			).rejects.toThrow('must declare executionIntent');
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('runs a one-shot skill as a synthetic single-step pipeline session', async () => {
		const workspace = await testTempDir('aidd-pipeline-oneshot-');
		const rootDir = await makeRoot(`
const projectDir = process.argv[process.argv.indexOf('--project-dir') + 1];
const flagValue = (name) => {
	const inline = process.argv.find((token) => token.startsWith(name + '='));
	if (inline !== undefined) return inline.slice(name.length + 1);
	const idx = process.argv.indexOf(name);
	return idx >= 0 ? process.argv[idx + 1] : '';
};
const skill = flagValue('--skill');
const skillArgs = flagValue('--skill-args');
await Bun.write(projectDir + '/oneshot-invocation.txt', skill + ' :: ' + skillArgs);
${heartbeatTerminator()}
`);
		try {
			await mkdir(join(rootDir, 'skills', 'demo-oneshot'), { recursive: true });
			await Bun.write(
				join(rootDir, 'skills', 'demo-oneshot', 'SKILL.md'),
				'---\nname: demo-oneshot\ndescription: Demo one-shot skill.\nmetadata:\n  aidd-category: runtime\n---\n\n# Demo Oneshot\n\nUse `$ARGUMENTS`.\n',
			);
			const projectDir = await makeProject(workspace);
			const { pipelineService, runService, sqlite } = makeHarness(rootDir, workspace);
			try {
				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					parameters: {
						args: 'sample',
						backend: '',
						executionIntent: 'apply-changes',
						model: '',
					},
					projectDir,
					recipeId: 'skill:demo-oneshot',
				});
				expect(session.recipeId).toBe('skill:demo-oneshot');
				expect(session.recipeName).toBe('Demo Oneshot');
				expect(session.totalSteps).toBe(1);

				const report = await waitForReport(pipelineService, session.id);
				expect(report.session.status).toBe('completed');
				expect(report.stepResults[0]?.stepType).toBe('skill');
				const invocation = await readFile(
					join(projectDir, 'oneshot-invocation.txt'),
					'utf8',
				);
				expect(invocation).toContain('demo-oneshot');
				expect(invocation).toContain('sample');

				// One-shot telemetry: a single top-level 'web' skill invocation and
				// no recipe invocation for the synthetic wrapper.
				const invocations = sqlite
					.query<
						{
							parent_invocation_id: null | string;
							resource_type: string;
							source: string;
						},
						[]
					>(
						'SELECT resource_type, source, parent_invocation_id FROM invocation_events ORDER BY started_at',
					)
					.all();
				expect(invocations.filter((row) => row.resource_type === 'recipe')).toEqual([]);
				const skillEvents = invocations.filter((row) => row.resource_type === 'skill');
				expect(skillEvents).toHaveLength(1);
				expect(skillEvents[0]?.source).toBe('web');
				expect(skillEvents[0]?.parent_invocation_id).toBeNull();
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('rejects shell step with cwd outside allowed roots without spawning', async () => {
		const workspace = await testTempDir('aidd-pipeline-cwd-guard-');
		const escapeDir = await testTempDir('aidd-pipeline-cwd-escape-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'cwd_escape',
					name: 'Cwd Escape',
					parameters: [],
					steps: [
						{
							configJson: {
								command: 'printf "leaked" > leaked.txt',
								cwd: escapeDir,
							},
							id: 'cwd_escape_step_1',
							name: 'Escape',
							stepType: 'shell',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'cwd_escape',
				});
				const report = await waitForReport(pipelineService, session.id);

				expect(report.session.status).toBe('failed');
				expect(report.session.completedTopLevelSteps).toBe(0);
				expect(report.stepResults).toHaveLength(1);
				expect(report.stepResults[0]?.errorMessage).toBe(
					'Shell step cwd is outside allowed roots',
				);
				expect(await Bun.file(join(escapeDir, 'leaked.txt')).exists()).toBe(false);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(escapeDir);
			await removeTempTree(rootDir);
		}
	});

	test('stops on a failing step when onFailure is stop', async () => {
		const workspace = await testTempDir('aidd-pipeline-stop-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'fail_stop',
					name: 'Fail Stop',
					parameters: [],
					steps: [
						{
							configJson: { command: 'exit 3' },
							id: 'fail_stop_step_1',
							name: 'Fail',
							stepType: 'shell',
						},
						{
							configJson: { command: 'printf "nope" > should-not-run.txt' },
							id: 'fail_stop_step_2',
							name: 'Skipped',
							stepType: 'shell',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'fail_stop',
				});
				const report = await waitForReport(pipelineService, session.id);

				expect(report.session.status).toBe('failed');
				expect(report.session.completedTopLevelSteps).toBe(0);
				expect(report.stepResults).toHaveLength(1);
				expect(await Bun.file(join(projectDir, 'should-not-run.txt')).exists()).toBe(false);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('continues after a failing step when onFailure is continue', async () => {
		const workspace = await testTempDir('aidd-pipeline-continue-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'fail_continue',
					name: 'Fail Continue',
					parameters: [],
					steps: [
						{
							configJson: { command: 'exit 4' },
							id: 'fail_continue_step_1',
							name: 'Fail',
							onFailure: 'continue',
							stepType: 'shell',
						},
						{
							configJson: { command: 'printf "ran" > continued.txt' },
							id: 'fail_continue_step_2',
							name: 'Continue',
							stepType: 'shell',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'fail_continue',
				});
				const report = await waitForReport(pipelineService, session.id);

				// A failed step followed by a completed one is a partial success, not a
				// clean completion — the session reads as completed_with_failures.
				expect(report.session.status).toBe('completed_with_failures');
				expect(report.session.completedTopLevelSteps).toBe(1);
				expect(report.session.errorMessage).toContain('Fail');
				expect(report.stepResults.map((step) => step.status)).toEqual([
					'failed',
					'completed',
				]);
				expect(await readFile(join(projectDir, 'continued.txt'), 'utf8')).toBe('ran');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('reports completed_with_failures when an early step succeeds and a late step fails', async () => {
		const workspace = await testTempDir('aidd-pipeline-partial-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'partial_failure',
					name: 'Partial Failure',
					parameters: [],
					steps: [
						{
							configJson: { command: 'printf "produced" > early.txt' },
							id: 'partial_step_1',
							name: 'Early success',
							stepType: 'shell',
						},
						{
							configJson: { command: 'exit 5' },
							id: 'partial_step_2',
							name: 'Late failure',
							stepType: 'shell',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'partial_failure',
				});
				const report = await waitForReport(pipelineService, session.id);

				// 1-of-2 steps produced value before a late failure: partial, not a bare crash.
				expect(report.session.status).toBe('completed_with_failures');
				expect(report.session.completedTopLevelSteps).toBe(1);
				expect(report.session.errorMessage).toContain('Late failure');
				expect(report.stepResults.map((step) => step.status)).toEqual([
					'completed',
					'failed',
				]);
				expect(await readFile(join(projectDir, 'early.txt'), 'utf8')).toBe('produced');

				// The session-metrics dump records what survived so a downstream consumer
				// can distinguish partial success from total failure.
				const dump = JSON.parse(
					await readFile(
						join(
							projectDir,
							'.aidd',
							'runtime',
							'pipeline-sessions',
							session.id,
							'metrics.json',
						),
						'utf8',
					),
				) as {
					failedStepNames: string[];
					producedArtifacts: { stepName: string }[];
					status: string;
				};
				expect(dump.status).toBe('completed_with_failures');
				expect(dump.failedStepNames).toEqual(['Late failure']);
				expect(dump.producedArtifacts.map((artifact) => artifact.stepName)).toEqual([
					'Early success',
				]);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('requires missing parameters and can auto-fix then retry failed steps', async () => {
		const workspace = await testTempDir('aidd-pipeline-auto-fix-');
		const rootDir = await makeRoot(`
import { join } from 'node:path';
const index = Bun.argv.indexOf('--project-dir');
const projectDir = Bun.argv[index + 1];
if (!projectDir) throw new Error('missing project dir');
await Bun.write(join(projectDir, 'fixed.txt'), 'fixed');
${heartbeatTerminator()}
`);
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'needs_parameter',
					name: 'Needs Parameter',
					parameters: [{ name: 'requiredValue' }],
					steps: [
						{
							configJson: { command: 'printf "{requiredValue}"' },
							id: 'needs_parameter_step_1',
							name: 'Needs value',
							stepType: 'shell',
						},
					],
				});
				await expect(
					pipelineService.launchRecipe({
						initiator: 'operator',
						projectDir,
						recipeId: 'needs_parameter',
					}),
				).rejects.toThrow('Missing required recipe parameter: requiredValue');

				await recipeService.writeRecipe({
					id: 'auto_fix',
					name: 'Auto Fix',
					parameters: [],
					steps: [
						{
							configJson: { command: 'test -f fixed.txt' },
							id: 'auto_fix_step_1',
							name: 'Needs fix',
							onFailure: 'auto-fix',
							retryCount: 1,
							stepType: 'shell',
						},
					],
				});
				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'auto_fix',
				});
				const report = await waitForReport(pipelineService, session.id);

				// Each attempt is its own row: the failure that provoked the auto-fix, the
				// remediation, and the retry that succeeded. The session still reads 'completed'
				// because the failed row is a superseded attempt, not a step the recipe lost.
				expect(report.session.status).toBe('completed');
				expect(
					report.stepResults.map((step) => [
						step.stepName,
						step.attemptNumber,
						step.attemptKind,
						step.status,
					]),
				).toEqual([
					['Needs fix', 1, 'ordinary', 'failed'],
					['Needs fix auto-fix', 1, 'auto-fix', 'completed'],
					['Needs fix', 2, 'ordinary', 'completed'],
				]);
				expect(await readFile(join(projectDir, 'fixed.txt'), 'utf8')).toBe('fixed');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('links aidd CLI steps to managed runs', async () => {
		const workspace = await testTempDir('aidd-pipeline-aidd-step-');
		const rootDir = await makeRoot(`
{
	const { writeFile } = await import('node:fs/promises');
	const __logPath = process.env.AIDD_EXT_LOG_PATH;
	if (__logPath) {
		await writeFile(__logPath, JSON.stringify(process.argv));
	}
}
${heartbeatTerminator()}
`);
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'aidd_step',
					name: 'aidd Step',
					parameters: [],
					steps: [
						{
							configJson: {
								auditAll: true,
								checkArtifacts: true,
								cliType: 'claude-code',
								filterBy: 'status',
								filterValue: 'backlog',
								maxIterations: 1,
								prompt: 'scan',
							},
							id: 'aidd_step_1',
							name: 'Managed run',
							stepType: 'aidd-cli',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'aidd_step',
				});
				const report = await waitForReport(pipelineService, session.id);
				const runId = report.stepResults[0]?.runId;

				expect(report.session.status).toBe('completed');
				expect(typeof runId).toBe('string');
				const run = await runService.getRun(runId ?? '');
				expect(run?.pipelineSessionId).toBe(session.id);
				expect(run?.backend).toBe('claude-code');
				expect((await runService.readOutput(runId ?? '')).output).toContain('--audit-all');
				expect((await runService.readOutput(runId ?? '')).output).toContain('claude-code');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('maps aidd CLI recipe triumvirate flag to triumvirate run mode', () => {
		const request = requestFromAiddCliStep({
			config: { triumvirate: true },
			pipelineSessionId: 'pipe_test',
			projectDir: 'D:/applications/sample',
		});

		expect(request.mode).toBe('triumvirate');
		expect(request.pipelineSessionId).toBe('pipe_test');
		expect(request.projectDir).toBe('D:/applications/sample');
	});

	test('maps feature targeting and write boundaries from aidd CLI recipe steps', () => {
		const request = requestFromAiddCliStep({
			config: {
				feature: 'archive-cli-command-suite',
				writeAllowlist: ['.aidd', 'CONTEXT.md'],
			},
			pipelineSessionId: 'pipe_test',
			projectDir: 'D:/public/starsync',
		});

		expect(request.feature).toBe('archive-cli-command-suite');
		expect(request.writeAllowlist).toEqual(['.aidd', 'CONTEXT.md']);
	});

	test('aidd CLI steps prefer backend and accept cliType as a backend alias', () => {
		const request = requestFromAiddCliStep({
			config: { backend: 'codex', model: 'step-model', prompt: 'x', reasoningEffort: 'high' },
			pipelineSessionId: 'pipe_test',
			projectDir: 'D:/applications/sample',
		});

		expect(request.backend).toBe('codex');
		expect(request.model).toBe('step-model');
		expect(request.reasoningEffort).toBe('high');
		// backend wins when both keys are present; cliType is accepted as an alias.
		expect(
			requestFromAiddCliStep({
				config: { backend: 'codex', cliType: 'claude-code' },
				pipelineSessionId: 'pipe_test',
				projectDir: 'D:/applications/sample',
			}).backend,
		).toBe('codex');
	});

	test('session launch override beats step config and persists on the session row', async () => {
		const workspace = await testTempDir('aidd-pipeline-launch-target-');
		const rootDir = await makeRoot(heartbeatTerminator());
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'pinned_step',
					name: 'Pinned Step',
					parameters: [],
					steps: [
						{
							configJson: {
								cliType: 'claude-code',
								maxIterations: 1,
								model: 'step-model',
								prompt: 'scan',
							},
							id: 'pinned_step_1',
							name: 'Managed run',
							stepType: 'aidd-cli',
						},
					],
				});

				// Without an override the step's own config applies, including the model.
				const plain = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'pinned_step',
				});
				const plainReport = await waitForReport(pipelineService, plain.id);
				expect(plainReport.session.status).toBe('completed');
				const plainRun = await runService.getRun(plainReport.stepResults[0]?.runId ?? '');
				expect(plainRun?.backend).toBe('claude-code');
				expect(plainRun?.model).toBe('step-model');
				const plainIdentity = {
					backend: 'claude-code',
					model: 'step-model',
					provider: null,
					reasoningEffort: 'low',
				};
				expect(plainReport.session.executionIdentities).toEqual([plainIdentity]);
				expect(plainReport.stepResults[0]?.executionIdentity).toEqual(plainIdentity);

				// The launch-time override wins over the step's pinned backend/model.
				const overridden = await pipelineService.launchRecipe({
					initiator: 'operator',
					launchTarget: { backend: 'codex', model: 'override-model' },
					projectDir,
					recipeId: 'pinned_step',
				});
				expect(overridden.executionIdentities).toEqual([
					{
						backend: 'codex',
						model: 'override-model',
						provider: null,
						reasoningEffort: null,
					},
				]);
				const overriddenReport = await waitForReport(pipelineService, overridden.id);
				expect(overriddenReport.session.status).toBe('completed');
				const overriddenRun = await runService.getRun(
					overriddenReport.stepResults[0]?.runId ?? '',
				);
				expect(overriddenRun?.backend).toBe('codex');
				expect(overriddenRun?.model).toBe('override-model');
				const overriddenIdentity = {
					backend: 'codex',
					model: 'override-model',
					provider: null,
					reasoningEffort: 'low',
				};
				expect(overriddenReport.session.executionIdentities).toEqual([overriddenIdentity]);
				expect(overriddenReport.stepResults[0]?.executionIdentity).toEqual(
					overriddenIdentity,
				);
				const listed = await pipelineService.listSessions({ limit: 100 });
				expect(
					listed.items.find((session) => session.id === overridden.id)
						?.executionIdentities,
				).toEqual([overriddenIdentity]);

				// Persisted on the session row so resumed sessions rehydrate the override.
				const row = sqlite
					.query<
						{ launch_backend: null | string; launch_model: null | string },
						[string]
					>('SELECT launch_backend, launch_model FROM pipeline_sessions WHERE id = ?')
					.get(overridden.id);
				expect(row).toEqual({ launch_backend: 'codex', launch_model: 'override-model' });

				await recipeService.writeRecipe({
					id: 'mixed_targets',
					name: 'Mixed Targets',
					parameters: [],
					steps: [
						{
							configJson: {
								backend: 'codex',
								maxIterations: 1,
								model: 'gpt-6-astra',
								prompt: 'first',
								reasoningEffort: 'high',
							},
							id: 'mixed_targets_1',
							name: 'Codex step',
							stepType: 'aidd-cli',
						},
						{
							configJson: {
								backend: 'claude-code',
								maxIterations: 1,
								model: 'claude-fable-5',
								prompt: 'second',
								reasoningEffort: 'xhigh',
							},
							id: 'mixed_targets_2',
							name: 'Claude step',
							stepType: 'aidd-cli',
						},
						{
							configJson: {
								backend: 'codex',
								maxIterations: 1,
								model: 'gpt-6-astra',
								prompt: 'third',
								reasoningEffort: 'high',
							},
							id: 'mixed_targets_3',
							name: 'Second Codex step',
							stepType: 'aidd-cli',
						},
					],
				});
				const mixed = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'mixed_targets',
				});
				const mixedReport = await waitForReport(pipelineService, mixed.id);
				const firstMixedIdentity = {
					backend: 'codex',
					model: 'gpt-6-astra',
					provider: null,
					reasoningEffort: 'high',
				};
				const secondMixedIdentity = {
					backend: 'claude-code',
					model: 'claude-fable-5',
					provider: null,
					reasoningEffort: 'xhigh',
				};
				const mixedIdentities = [firstMixedIdentity, secondMixedIdentity];
				expect(mixedReport.session.executionIdentities).toEqual(mixedIdentities);
				expect(mixedReport.stepResults.map((step) => step.executionIdentity)).toEqual([
					firstMixedIdentity,
					secondMixedIdentity,
					firstMixedIdentity,
				]);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('detects recipe-ref cycles and maximum nesting depth', async () => {
		const workspace = await testTempDir('aidd-pipeline-recursion-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'cycle_a',
					name: 'Cycle A',
					parameters: [],
					steps: [
						{
							configJson: { recipeName: 'Cycle B' },
							id: 'cycle_a_step_1',
							name: 'B',
							stepType: 'recipe-ref',
						},
					],
				});
				// Bypass save-time validation to simulate a referenced recipe changed directly on disk.
				// The execution guard must still catch cycles introduced outside RecipeService.
				await Bun.write(
					join(rootDir, 'recipes', 'cycle_b.json'),
					JSON.stringify({
						name: 'Cycle B',
						parameters: [],
						steps: [
							{
								configJson: { recipeName: 'Cycle A' },
								id: 'cycle_b_step_1',
								name: 'A',
								stepType: 'recipe-ref',
							},
						],
					}),
				);

				const cycle = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'cycle_a',
				});
				const cycleReport = await waitForReport(pipelineService, cycle.id);
				expect(cycleReport.session.status).toBe('failed');
				expect(cycleReport.session.errorMessage).toContain('Recipe cycle detected');

				for (let index = 1; index <= 7; index += 1) {
					await recipeService.writeRecipe({
						id: `depth_${index}`,
						name: `Depth ${index}`,
						parameters: [],
						steps: [
							{
								configJson:
									index === 7
										? { command: 'printf "too deep"' }
										: { recipeName: `Depth ${index + 1}` },
								id: `depth_${index}_step_1`,
								name: `Step ${index}`,
								stepType: index === 7 ? 'shell' : 'recipe-ref',
							},
						],
					});
				}
				const depth = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'depth_1',
				});
				const depthReport = await waitForReport(pipelineService, depth.id);
				expect(depthReport.session.status).toBe('failed');
				expect(depthReport.session.errorMessage).toContain('depth exceeded 5');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('stop request marks active sessions stopped', async () => {
		const workspace = await testTempDir('aidd-pipeline-stop-request-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'long_shell',
					name: 'Long Shell',
					parameters: [],
					steps: [
						{
							configJson: { command: 'sleep 5' },
							id: 'long_shell_step_1',
							name: 'Sleep',
							stepType: 'shell',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'long_shell',
				});
				await wait(100);
				await pipelineService.stopSession(session.id);
				const report = await waitForReport(pipelineService, session.id);

				expect(report.session.status).toBe('stopped');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('publishes coherent top-level progress through normal execution', async () => {
		const workspace = await testTempDir('aidd-pipeline-live-progress-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { hub, pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			const messages: WebSocketEvent[] = [];
			hub.add({ send: (data) => messages.push(JSON.parse(data) as WebSocketEvent) });
			try {
				await recipeService.writeRecipe({
					id: 'live_progress_recipe',
					name: 'Live Progress Recipe',
					parameters: [],
					steps: [
						{
							configJson: { command: 'sleep 0.4' },
							id: 'live_progress_step_1',
							name: 'First active step',
							stepType: 'shell',
						},
						{
							configJson: { command: 'sleep 0.4' },
							id: 'live_progress_step_2',
							name: 'Second active step',
							stepType: 'shell',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'live_progress_recipe',
				});
				const deadline = Date.now() + 8_000;
				let duringFirst = await pipelineService.getReport(session.id);
				while (
					Date.now() < deadline &&
					duringFirst?.session.activeTopLevelStep?.sequenceNumber !== 1
				) {
					await wait(20);
					duringFirst = await pipelineService.getReport(session.id);
				}
				expect(duringFirst?.session).toMatchObject({
					activeTopLevelStep: { sequenceNumber: 1, stepName: 'First active step' },
					completedTopLevelSteps: 0,
				});

				let duringSecond = duringFirst;
				while (
					Date.now() < deadline &&
					duringSecond?.session.activeTopLevelStep?.sequenceNumber !== 2
				) {
					await wait(20);
					duringSecond = await pipelineService.getReport(session.id);
				}
				expect(duringSecond?.session).toMatchObject({
					activeTopLevelStep: { sequenceNumber: 2, stepName: 'Second active step' },
					completedTopLevelSteps: 1,
				});
				const listedDuringSecond = (
					await pipelineService.listSessions({ limit: 100 })
				).items.find((item) => item.id === session.id);
				expect(listedDuringSecond).toMatchObject({
					activeTopLevelStep: { sequenceNumber: 2, stepName: 'Second active step' },
					completedTopLevelSteps: 1,
				});

				const completed = await waitForReport(pipelineService, session.id);
				expect(completed.session).toMatchObject({
					activeTopLevelStep: null,
					completedTopLevelSteps: 2,
					status: 'completed',
				});
				const progressEvents = messages.filter(
					(message) => message.type === 'pipeline_progress',
				);
				expect(progressEvents).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							payload: expect.objectContaining({
								activeTopLevelStep: expect.objectContaining({ sequenceNumber: 1 }),
								completedTopLevelSteps: 0,
							}),
						}),
						expect.objectContaining({
							payload: expect.objectContaining({
								activeTopLevelStep: expect.objectContaining({ sequenceNumber: 2 }),
								completedTopLevelSteps: 1,
							}),
						}),
						expect.objectContaining({
							payload: expect.objectContaining({
								activeTopLevelStep: null,
								completedTopLevelSteps: 2,
							}),
						}),
					]),
				);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	}, 15_000);

	test('derives historical API progress from successful top-level results', async () => {
		const workspace = await testTempDir('aidd-pipeline-historical-progress-');
		const rootDir = await makeRoot();
		try {
			const { pipelineService, runService, sqlite } = makeHarness(rootDir, workspace);
			try {
				const projectPath = workspace.replaceAll("'", "''");
				sqlite.exec(`
INSERT INTO pipeline_sessions (
	id, recipe_id, recipe_name, project_path, project_name,
	status, current_step_index, total_steps, parameters_json, started_at, completed_at
) VALUES (
	'pipe_historical_progress', 'historical', 'Historical',
	'${projectPath}', 'workspace', 'failed', 3, 3, '{}', 1, 5
);
INSERT INTO pipeline_step_results (
	id, session_id, sequence_number, display_order, depth,
	phase, step_name, step_type, status, started_at, completed_at
) VALUES
	('historical_completed_1', 'pipe_historical_progress', 1, 1, 0,
	 'step', 'Completed', 'shell', 'completed', 1, 2),
	('historical_completed_retry', 'pipe_historical_progress', 1, 2, 0,
	 'step', 'Completed retry', 'shell', 'completed', 2, 3),
	('historical_failed', 'pipe_historical_progress', 2, 3, 0,
	 'step', 'Failed', 'shell', 'failed', 3, 4),
	('historical_stopped', 'pipe_historical_progress', 3, 4, 0,
	 'step', 'Stopped', 'shell', 'stopped', 4, 5);
`);
				const report = await pipelineService.getReport('pipe_historical_progress');
				const listed = (await pipelineService.listSessions({ limit: 100 })).items.find(
					(item) => item.id === 'pipe_historical_progress',
				);

				expect(report?.session.completedTopLevelSteps).toBe(1);
				expect(listed?.completedTopLevelSteps).toBe(1);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('resume reconciliation fails sessions whose recipe is missing', async () => {
		const workspace = await testTempDir('aidd-pipeline-stale-');
		const rootDir = await makeRoot();
		try {
			const { pipelineService, runService, sqlite } = makeHarness(rootDir, workspace);
			try {
				sqlite.exec(`
INSERT INTO pipeline_sessions (
	id,
	recipe_id,
	recipe_name,
	project_path,
	project_name,
	status,
	current_step_index,
	total_steps,
	parameters_json,
	started_at
) VALUES (
	'pipe_stale',
	'stale',
	'Stale',
	'${workspace.replaceAll("'", "''")}',
	'workspace',
	'running',
	1,
	1,
	'{}',
	1
);
`);
				await pipelineService.resumeStaleSessions();
				const report = await pipelineService.getReport('pipe_stale');

				expect(report?.session.status).toBe('failed');
				expect(report?.session.completedTopLevelSteps).toBe(0);
				expect(report?.session.errorMessage).toContain('Recipe not found');
				expect(report?.session.errorMessage).toContain('cannot be resumed');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('resume reconciliation picks up running session and completes remaining shell step', async () => {
		const workspace = await testTempDir('aidd-pipeline-resume-shell-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'resume_shell_recipe',
					name: 'Resume Shell Recipe',
					parameters: [],
					steps: [
						{
							configJson: { command: 'printf "first"' },
							id: 'rsr_step_1',
							name: 'First',
							stepType: 'shell',
						},
						{
							configJson: { command: 'printf "second"' },
							id: 'rsr_step_2',
							name: 'Second',
							stepType: 'shell',
						},
					],
				});
				// Simulate a prior web instance that completed step 1 then died before
				// step 2 ran. Status is 'running'; currentStepIndex is the successful
				// top-level completion count, and step 1 has a completed result row.
				const projectDirSql = projectDir.replaceAll("'", "''");
				sqlite.exec(`
INSERT INTO pipeline_sessions (
	id, recipe_id, recipe_name, project_path, project_name,
	status, current_step_index, total_steps, parameters_json, started_at
) VALUES (
	'pipe_resume_shell', 'resume_shell_recipe', 'Resume Shell Recipe',
	'${projectDirSql}', 'sample-project', 'running', 1, 2, '{}', 1
);
INSERT INTO pipeline_step_results (
	id, session_id, sequence_number, display_order, depth,
	phase, step_name, step_type, status, started_at, completed_at
) VALUES (
	'rsr_result_1', 'pipe_resume_shell', 1, 1, 0,
	'step', 'First', 'shell', 'completed', 1, 2
);
`);
				await pipelineService.resumeStaleSessions();
				// Wait for the resumed background execution to finish step 2.
				const deadline = Date.now() + 7000;
				let report = await pipelineService.getReport('pipe_resume_shell');
				while (
					Date.now() < deadline &&
					report?.session.status !== 'completed' &&
					report?.session.status !== 'failed'
				) {
					await wait(50);
					report = await pipelineService.getReport('pipe_resume_shell');
				}
				expect(report?.session.status).toBe('completed');
				const sequences = (report?.stepResults ?? [])
					.map((step) => step.sequenceNumber)
					.sort();
				expect(sequences).toEqual([1, 2]);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('resume reconciliation recursively unwinds nested recipes before advancing', async () => {
		const workspace = await testTempDir('aidd-pipeline-resume-nested-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'resume_nested_child',
					name: 'Resume Nested Child',
					parameters: [],
					steps: [
						{
							configJson: { prompt: 'already launched' },
							id: 'rnc_step_1',
							name: 'Surviving managed child',
							stepType: 'aidd-cli',
						},
						{
							configJson: { command: 'printf "child remainder"' },
							id: 'rnc_step_2',
							name: 'Child remainder',
							stepType: 'shell',
						},
					],
				});
				await recipeService.writeRecipe({
					id: 'resume_nested_middle',
					name: 'Resume Nested Middle',
					parameters: [],
					steps: [
						{
							configJson: { recipeName: 'Resume Nested Child' },
							id: 'rnm_step_1',
							name: 'Nested child',
							stepType: 'recipe-ref',
						},
						{
							configJson: { command: 'printf "middle remainder"' },
							id: 'rnm_step_2',
							name: 'Middle remainder',
							stepType: 'shell',
						},
					],
				});
				await recipeService.writeRecipe({
					id: 'resume_nested_parent',
					name: 'Resume Nested Parent',
					parameters: [],
					steps: [
						{
							configJson: { recipeName: 'Resume Nested Middle' },
							id: 'rnp_step_1',
							name: 'Nested middle',
							stepType: 'recipe-ref',
						},
						{
							configJson: { command: 'printf "parent remainder"' },
							id: 'rnp_step_2',
							name: 'Parent remainder',
							stepType: 'shell',
						},
					],
				});
				const projectDirSql = projectDir.replaceAll("'", "''");
				sqlite.exec(`
INSERT INTO pipeline_sessions (
	id, recipe_id, recipe_name, project_path, project_name,
	status, current_step_index, total_steps, parameters_json, started_at
) VALUES (
	'pipe_resume_nested', 'resume_nested_parent', 'Resume Nested Parent',
	'${projectDirSql}', 'sample-project', 'running', 0, 2, '{}', 1
);
INSERT INTO runs (
	id, backend, mode, pipeline_session_id, project_name, project_path,
	source, started_at, status
) VALUES (
	'run_nested_child', 'native', 'coding', 'pipe_resume_nested',
	'sample-project', '${projectDirSql}', 'web', 2, 'running'
);
INSERT INTO pipeline_step_results (
	id, session_id, parent_step_result_id, sequence_number, display_order, depth,
	phase, step_name, step_type, status, started_at, run_id
) VALUES
		('nested_wrapper', 'pipe_resume_nested', NULL, 1, 1, 0,
		'step', 'Nested middle', 'recipe-ref', 'running', 1, NULL),
	('middle_wrapper', 'pipe_resume_nested', 'nested_wrapper', 1, 2, 1,
		'step', 'Nested child', 'recipe-ref', 'running', 2, NULL),
	('nested_managed', 'pipe_resume_nested', 'middle_wrapper', 1, 3, 2,
		'step', 'Surviving managed child', 'aidd-cli', 'running', 2, 'run_nested_child');
`);

				await pipelineService.resumeStaleSessions();
				await wait(300);
				const stillWaiting = await pipelineService.getReport('pipe_resume_nested');
				expect(stillWaiting?.session.status).toBe('running');
				expect(stillWaiting?.stepResults).toHaveLength(3);
				expect(stillWaiting?.stepResults.map((step) => step.status)).toEqual([
					'running',
					'running',
					'running',
				]);
				sqlite.exec(`
UPDATE runs
SET status = 'completed', completed_at = 3, duration_ms = 1, exit_code = 0
WHERE id = 'run_nested_child';
`);
				// The nested recovery launches three shell remainders in sequence. Under coverage
				// instrumentation, process startup can consume a seven-second polling window
				// even though recovery is still advancing normally.
				const deadline = Date.now() + 12_000;
				let report = await pipelineService.getReport('pipe_resume_nested');
				while (
					Date.now() < deadline &&
					report?.session.status !== 'completed' &&
					report?.session.status !== 'failed'
				) {
					await wait(50);
					report = await pipelineService.getReport('pipe_resume_nested');
				}

				expect(report?.session.status).toBe('completed');
				expect(
					(report?.stepResults ?? []).map((step) => ({
						name: step.stepName,
						parent: step.parentStepResultId,
						status: step.status,
					})),
				).toEqual([
					{ name: 'Nested middle', parent: null, status: 'completed' },
					{ name: 'Nested child', parent: 'nested_wrapper', status: 'completed' },
					{
						name: 'Surviving managed child',
						parent: 'middle_wrapper',
						status: 'completed',
					},
					{ name: 'Child remainder', parent: 'middle_wrapper', status: 'completed' },
					{ name: 'Middle remainder', parent: 'nested_wrapper', status: 'completed' },
					{ name: 'Parent remainder', parent: null, status: 'completed' },
				]);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('resume rehydrates the session root invocation so nested steps stay nested', async () => {
		const workspace = await testTempDir('aidd-pipeline-resume-telemetry-');
		// The resumed child actually launches its skill run, so the fake CLI has to terminalize.
		const rootDir = await makeRoot(heartbeatTerminator());
		try {
			await mkdir(join(rootDir, 'skills', 'demo-resume-skill'), { recursive: true });
			await Bun.write(
				join(rootDir, 'skills', 'demo-resume-skill', 'SKILL.md'),
				'---\nname: demo-resume-skill\ndescription: Demo skill.\nmetadata:\n  aidd-category: runtime\n---\n\n# Demo Resume Skill\n',
			);
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'resume_telemetry_child',
					name: 'Resume Telemetry Child',
					parameters: [],
					steps: [
						{
							configJson: { command: 'printf "child first"' },
							id: 'rtc_step_1',
							name: 'Child first',
							stepType: 'shell',
						},
						{
							configJson: {
								executionIntent: 'review-only',
								skillId: 'demo-resume-skill',
							},
							id: 'rtc_step_2',
							name: 'Child skill',
							stepType: 'skill',
						},
					],
				});
				await recipeService.writeRecipe({
					id: 'resume_telemetry_parent',
					name: 'Resume Telemetry Parent',
					parameters: [],
					steps: [
						{
							configJson: { recipeName: 'Resume Telemetry Child' },
							id: 'rtp_step_1',
							name: 'Nested child',
							stepType: 'recipe-ref',
						},
					],
				});
				const projectDirSql = projectDir.replaceAll("'", "''");
				// The original launch recorded a root 'recipe' invocation and then web died mid
				// recipe-ref. That event is the only surviving record of the root id — the session
				// row does not carry one — so resume has to read it back or run without a root.
				sqlite.exec(`
INSERT INTO pipeline_sessions (
	id, recipe_id, recipe_name, project_path, project_name,
	status, current_step_index, total_steps, parameters_json, started_at
) VALUES (
	'pipe_resume_telemetry', 'resume_telemetry_parent', 'Resume Telemetry Parent',
	'${projectDirSql}', 'sample-project', 'running', 0, 1, '{}', 1
);
INSERT INTO invocation_events (
	id, project_name, project_path, resource_id, resource_name, resource_type,
	session_id, source, started_at, status
) VALUES (
	'inv_root_resume', 'sample-project', '${projectDirSql}',
	'resume_telemetry_parent', 'Resume Telemetry Parent', 'recipe',
	'pipe_resume_telemetry', 'web', 1, 'running'
);
INSERT INTO pipeline_step_results (
	id, session_id, parent_step_result_id, sequence_number, display_order, depth,
	phase, step_name, step_type, status, started_at
) VALUES
	('trs_wrapper', 'pipe_resume_telemetry', NULL, 1, 1, 0,
		'step', 'Nested child', 'recipe-ref', 'running', 1),
	('trs_child_1', 'pipe_resume_telemetry', 'trs_wrapper', 1, 2, 1,
		'step', 'Child first', 'shell', 'completed', 1);
`);

				await pipelineService.resumeStaleSessions();
				const deadline = Date.now() + 12_000;
				let report = await pipelineService.getReport('pipe_resume_telemetry');
				while (
					Date.now() < deadline &&
					report?.session.status !== 'completed' &&
					report?.session.status !== 'failed'
				) {
					await wait(50);
					report = await pipelineService.getReport('pipe_resume_telemetry');
				}
				expect(report?.session.status).toBe('completed');

				const invocations = sqlite
					.query<
						{
							id: string;
							parent_invocation_id: null | string;
							parent_resource_id: null | string;
							resource_type: string;
							source: string;
						},
						[]
					>(
						'SELECT id, resource_type, source, parent_invocation_id, parent_resource_id FROM invocation_events ORDER BY started_at',
					)
					.all();
				const skillEvent = invocations.find((row) => row.resource_type === 'skill');
				// The step ran after the resume, so its parent is the root the launch recorded.
				expect(skillEvent?.parent_invocation_id).toBe('inv_root_resume');
				expect(skillEvent?.parent_resource_id).toBe('resume_telemetry_parent');
				expect(skillEvent?.source).toBe('recipe-step');
				// Read back, not re-recorded: a second root event would double-count the launch.
				expect(invocations.filter((row) => row.resource_type === 'recipe')).toHaveLength(1);
				// The shape the defect produced: a step naming a parent recipe by id with no
				// invocation to hang it on, which the /telemetry nested split reads as top-level.
				expect(
					invocations.filter(
						(row) =>
							row.parent_resource_id !== null && row.parent_invocation_id === null,
					),
				).toEqual([]);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
		// The resumed child launches a managed skill run; the default 5s budget expires while it
		// is still legitimately in flight.
	}, 20_000);

	test('resume recovers the root invocation from the session index without a new column', async () => {
		const queries = await readFile(
			join(import.meta.dir, '../../backend/src/services/telemetry/queries.ts'),
			'utf8',
		);
		// Criterion: the lookup keys off the existing indexed session_id, so no migration.
		expect(queries).toContain('export async function findSessionRootInvocationId(');
		expect(queries).toContain('eq(invocationEvents.sessionId, sessionId)');
		expect(queries).toContain('isNull(invocationEvents.parentInvocationId)');
		const schema = await readFile(
			join(import.meta.dir, '../../backend/src/db/schema/invocationTables.ts'),
			'utf8',
		);
		expect(schema).toContain("index('idx_invocation_events_session_id')");

		const launch = await readFile(
			join(import.meta.dir, '../../backend/src/services/pipeline/launchService.ts'),
			'utf8',
		);
		// Rehydrated before the first resumed step runs, not alongside it.
		expect(launch).toContain(
			'context.invocationId = await this.telemetryService.findSessionRootInvocationId(',
		);
		const resumeExecution = launch.slice(launch.indexOf('private async resumeExecution('));
		expect(resumeExecution.indexOf('findSessionRootInvocationId')).toBeLessThan(
			resumeExecution.indexOf('this.sessionExecutor.resume('),
		);

		const recipeRef = await readFile(
			join(import.meta.dir, '../../backend/src/services/pipeline/recipeRefHandler.ts'),
			'utf8',
		);
		// The child context inherits the resumed root instead of being cleared to nothing.
		expect(recipeRef).not.toContain('invocationId: undefined');
	});

	test('resume reconciliation fails in-flight shell step and respects onFailure=stop', async () => {
		const workspace = await testTempDir('aidd-pipeline-resume-inflight-shell-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'resume_inflight_recipe',
					name: 'Resume In-flight Recipe',
					parameters: [],
					steps: [
						{
							configJson: { command: 'printf "first"' },
							id: 'rir_step_1',
							name: 'First',
							onFailure: 'stop',
							stepType: 'shell',
						},
					],
				});
				const projectDirSql = projectDir.replaceAll("'", "''");
				sqlite.exec(`
INSERT INTO pipeline_sessions (
	id, recipe_id, recipe_name, project_path, project_name,
	status, current_step_index, total_steps, parameters_json, started_at
) VALUES (
	'pipe_resume_inflight', 'resume_inflight_recipe', 'Resume In-flight Recipe',
	'${projectDirSql}', 'sample-project', 'running', 1, 1, '{}', 1
);
INSERT INTO pipeline_step_results (
	id, session_id, sequence_number, display_order, depth,
	phase, step_name, step_type, status, started_at
) VALUES (
	'rir_result_1', 'pipe_resume_inflight', 1, 1, 0,
	'step', 'First', 'shell', 'running', 1
);
`);
				await pipelineService.resumeStaleSessions();
				const deadline = Date.now() + 7000;
				let report = await pipelineService.getReport('pipe_resume_inflight');
				while (
					Date.now() < deadline &&
					report?.session.status !== 'completed' &&
					report?.session.status !== 'failed'
				) {
					await wait(50);
					report = await pipelineService.getReport('pipe_resume_inflight');
				}
				expect(report?.session.status).toBe('failed');
				expect(report?.session.completedTopLevelSteps).toBe(0);
				const stepResult = (report?.stepResults ?? []).find(
					(step) => step.id === 'rir_result_1',
				);
				expect(stepResult?.status).toBe('failed');
				expect(stepResult?.errorMessage).toContain('did not survive');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('recipe routes persist conditions and reject invalid condition objects', async () => {
		const workspace = await testTempDir('aidd-recipe-conditions-workspace-');
		const rootDir = await makeRoot();
		try {
			const { app, pipelineService, runService, sqlite } = makeServerHarness(
				rootDir,
				workspace,
			);
			try {
				const condition = {
					equals: 'false',
					parameter: 'stopBeforeImplementation',
				};
				const recipePayload = {
					name: 'Conditional Recipe',
					parameters: [],
					steps: [
						{
							configJson: { command: 'bun run build' },
							id: 'conditional_step',
							name: 'Build',
							stepType: 'shell',
							when: condition,
						},
					],
				};
				const saveResponse = await app.handle(
					new Request('http://localhost/api/v1/recipes/conditional', {
						body: JSON.stringify(recipePayload),
						headers: { 'content-type': 'application/json' },
						method: 'PUT',
					}),
				);
				expect(saveResponse.status).toBe(200);
				const saved = (await saveResponse.json()) as { recipe: RecipeDefinition };
				expect(saved.recipe.steps[0]?.when).toEqual(condition);

				const diskPayload = JSON.parse(
					await readFile(join(rootDir, 'recipes', 'conditional.json'), 'utf8'),
				) as { steps: { when?: unknown }[] };
				expect(diskPayload.steps[0]?.when).toEqual(condition);

				const reloadResponse = await app.handle(
					new Request('http://localhost/api/v1/recipes/conditional'),
				);
				expect(reloadResponse.status).toBe(200);
				const reloaded = (await reloadResponse.json()) as { recipe: RecipeDefinition };
				expect(reloaded.recipe.steps[0]?.when).toEqual(condition);
				expect(toDrafts(reloaded.recipe)[0]).toMatchObject({
					whenEquals: condition.equals,
					whenParameter: condition.parameter,
				});

				for (const invalidWhen of [
					{ parameter: condition.parameter },
					{ equals: condition.equals, parameter: false },
				]) {
					const invalidResponse = await app.handle(
						new Request('http://localhost/api/v1/recipes/conditional', {
							body: JSON.stringify({
								...recipePayload,
								steps: [{ ...recipePayload.steps[0], when: invalidWhen }],
							}),
							headers: { 'content-type': 'application/json' },
							method: 'PUT',
						}),
					);
					expect(invalidResponse.status).toBe(400);
				}

				const unchanged = JSON.parse(
					await readFile(join(rootDir, 'recipes', 'conditional.json'), 'utf8'),
				) as { steps: { when?: unknown }[] };
				expect(unchanged.steps[0]?.when).toEqual(condition);

				const cycleResponse = await app.handle(
					new Request('http://localhost/api/v1/recipes/self_cycle', {
						body: JSON.stringify({
							name: 'Self cycle',
							parameters: [],
							steps: [
								{
									configJson: { recipeName: 'self_cycle' },
									name: 'Run self',
									stepType: 'recipe-ref',
								},
							],
						}),
						headers: { 'content-type': 'application/json' },
						method: 'PUT',
					}),
				);
				expect(cycleResponse.status).toBe(409);
				expect(await cycleResponse.text()).toContain(
					'Recipe cycle detected: self_cycle -> self_cycle',
				);
				expect(await Bun.file(join(rootDir, 'recipes', 'self_cycle.json')).exists()).toBe(
					false,
				);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	// The explicit timeout is because the stop leg is the slow one and it is slow for a real reason:
	// the route does not return until the spawned step process is actually gone. Measured at 4.16s
	// for that one request under full-suite load on Windows, against a 5s default the other five
	// legs of this test also have to fit inside. Alone it finishes comfortably; the failure this
	// prevents is a timeout that reads as a broken stop route and is really process teardown.
	test('recipe and pipeline routes list, read, launch, report, and stop sessions', async () => {
		const workspace = await testTempDir('aidd-pipeline-routes-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { app, pipelineService, recipeService, runService, sqlite } = makeServerHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'route_recipe',
					name: 'Route Recipe',
					parameters: [],
					steps: [
						{
							configJson: { command: 'printf "route"' },
							id: 'route_recipe_step_1',
							name: 'Route Shell',
							stepType: 'shell',
						},
					],
				});

				const listResponse = await app.handle(
					new Request('http://localhost/api/v1/recipes'),
				);
				const list = (await listResponse.json()) as { recipes: { id: string }[] };
				expect(list.recipes.map((recipe) => recipe.id)).toContain('route_recipe');

				const readResponse = await app.handle(
					new Request('http://localhost/api/v1/recipes/route_recipe'),
				);
				const read = (await readResponse.json()) as { recipe: { name: string } };
				expect(read.recipe.name).toBe('Route Recipe');

				const launchResponse = await app.handle(
					new Request('http://localhost/api/v1/recipes/route_recipe/launch', {
						body: JSON.stringify({ projectDir }),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					}),
				);
				const launch = (await launchResponse.json()) as { session: { id: string } };
				await waitForReport(pipelineService, launch.session.id);

				const reportResponse = await app.handle(
					new Request(
						`http://localhost/api/v1/pipeline-sessions/${launch.session.id}/report`,
					),
				);
				const report = (await reportResponse.json()) as {
					report: {
						session: {
							activeTopLevelStep: null | { sequenceNumber: number };
							completedTopLevelSteps: number;
						};
						stepResults: { status: string }[];
					};
				};
				expect(report.report.stepResults[0]?.status).toBe('completed');
				expect(report.report.session).toMatchObject({
					activeTopLevelStep: null,
					completedTopLevelSteps: 1,
				});
				const sessionsResponse = await app.handle(
					new Request('http://localhost/api/v1/pipeline-sessions'),
				);
				const sessions = (await sessionsResponse.json()) as {
					sessions: {
						activeTopLevelStep: null | { sequenceNumber: number };
						completedTopLevelSteps: number;
						id: string;
					}[];
				};
				expect(
					sessions.sessions.find((item) => item.id === launch.session.id),
				).toMatchObject({
					activeTopLevelStep: null,
					completedTopLevelSteps: 1,
				});

				await recipeService.writeRecipe({
					id: 'route_stop',
					name: 'Route Stop',
					parameters: [],
					steps: [
						{
							configJson: { command: 'sleep 5' },
							id: 'route_stop_step_1',
							name: 'Sleep',
							stepType: 'shell',
						},
					],
				});
				const stopLaunchResponse = await app.handle(
					new Request('http://localhost/api/v1/recipes/route_stop/launch', {
						body: JSON.stringify({ projectDir }),
						headers: { 'content-type': 'application/json' },
						method: 'POST',
					}),
				);
				const stopLaunch = (await stopLaunchResponse.json()) as { session: { id: string } };
				await wait(100);
				const stopResponse = await app.handle(
					new Request(
						`http://localhost/api/v1/pipeline-sessions/${stopLaunch.session.id}/stop`,
						{ method: 'POST' },
					),
				);
				expect(stopResponse.status).toBe(200);
				const stopped = await waitForReport(pipelineService, stopLaunch.session.id);
				expect(stopped.session.status).toBe('stopped');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	}, 30_000);

	test('report includes the full recipe step plan, including steps not yet executed', async () => {
		const workspace = await testTempDir('aidd-pipeline-report-plan-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'three_step',
					name: 'Three Step',
					parameters: [],
					steps: [
						{
							configJson: { command: 'printf "first"' },
							id: 'three_step_step_1',
							name: 'First',
							stepType: 'shell',
						},
						{
							configJson: { command: 'sleep 3' },
							id: 'three_step_step_2',
							name: 'Second',
							stepType: 'shell',
						},
						{
							configJson: { command: 'printf "third"' },
							id: 'three_step_step_3',
							name: 'Third',
							stepType: 'shell',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'three_step',
				});
				// Poll until at least the first step has a result row but before the
				// whole session completes, so we can observe the not-yet-run steps.
				const deadline = Date.now() + 7000;
				let report = await pipelineService.getReport(session.id);
				while (
					report !== undefined &&
					Date.now() < deadline &&
					(report.stepResults.length < 1 || report.session.status === 'queued')
				) {
					await wait(25);
					report = await pipelineService.getReport(session.id);
				}

				// The report carries the full recipe plan — all 3 steps — even while
				// only a subset has executed. This is the data the UI needs to show
				// "how many steps are left / what step are we on."
				expect(report?.recipeSteps.map((s) => s.name)).toEqual([
					'First',
					'Second',
					'Third',
				]);
				expect(report?.recipeSteps.length).toBe(3);

				// Wait for completion to let the background execution settle.
				const finalReport = await waitForReport(pipelineService, session.id);
				expect(finalReport.session.status).toBe('completed');
				// The plan is still present after completion.
				expect(finalReport.recipeSteps.map((s) => s.name)).toEqual([
					'First',
					'Second',
					'Third',
				]);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('report falls back to an empty recipe plan when the recipe has been deleted', async () => {
		const workspace = await testTempDir('aidd-pipeline-report-deleted-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'deletable',
					name: 'Deletable',
					parameters: [],
					steps: [
						{
							configJson: { command: 'printf "ok"' },
							id: 'deletable_step_1',
							name: 'Only',
							stepType: 'shell',
						},
					],
				});
				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					projectDir,
					recipeId: 'deletable',
				});
				await waitForReport(pipelineService, session.id);
				await recipeService.deleteRecipe('deletable');

				const report = await pipelineService.getReport(session.id);
				// A deleted recipe must not crash the report; the plan is simply empty.
				expect(report?.recipeSteps).toEqual([]);
				expect(report?.session.status).toBe('completed');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});
});

describe('pipeline step-row integrity', () => {
	test('runFailureNarrative prefers errorMessage, then summary, then aiSummary, then generic', async () => {
		const { runFailureNarrative } =
			await import('../../backend/src/services/pipeline/helpers.ts');
		expect(
			runFailureNarrative({
				aiSummary: 'ai',
				errorMessage: 'boom',
				status: 'failed',
				summary: 'sum',
			}),
		).toBe('boom');
		expect(
			runFailureNarrative({
				aiSummary: 'ai',
				errorMessage: null,
				status: 'failed',
				summary: 'coding blocked by roadmap gate: unmapped_features',
			}),
		).toBe('coding blocked by roadmap gate: unmapped_features');
		expect(
			runFailureNarrative({
				aiSummary: 'ai text',
				errorMessage: null,
				status: 'failed',
				summary: null,
			}),
		).toBe('ai text');
		expect(
			runFailureNarrative({
				aiSummary: 'x'.repeat(600),
				errorMessage: null,
				status: 'failed',
				summary: null,
			}),
		).toHaveLength(501);
		expect(
			runFailureNarrative({
				aiSummary: null,
				errorMessage: null,
				status: 'stopped',
				summary: null,
			}),
		).toBe('Run finished with status stopped');
	});

	test('resume terminalizes duplicate in-flight step rows instead of stranding them', async () => {
		const workspace = await testTempDir('aidd-pipeline-dupes-');
		const rootDir = await makeRoot();
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'dupe_recipe',
					name: 'Dupe Recipe',
					parameters: [],
					steps: [
						{
							configJson: { command: 'printf "only"' },
							id: 'dupe_step_1',
							name: 'Only',
							stepType: 'shell',
						},
					],
				});
				const projectDirSql = projectDir.replaceAll("'", "''");
				// Two 'running' rows for the same step — the artifact of two concurrent
				// executions of one session (observed in production data).
				sqlite.exec(`
INSERT INTO pipeline_sessions (
	id, recipe_id, recipe_name, project_path, project_name,
	status, current_step_index, total_steps, parameters_json, started_at
) VALUES (
	'pipe_dupes', 'dupe_recipe', 'Dupe Recipe',
	'${projectDirSql}', 'sample-project', 'running', 1, 1, '{}', 1
);
INSERT INTO pipeline_step_results (
	id, session_id, sequence_number, display_order, depth,
	phase, step_name, step_type, status, started_at
) VALUES
	('dupe_row_a', 'pipe_dupes', 1, 1, 0, 'step', 'Only', 'shell', 'running', 1),
	('dupe_row_b', 'pipe_dupes', 1, 2, 0, 'step', 'Only', 'shell', 'running', 2);
`);
				await pipelineService.resumeStaleSessions();
				const deadline = Date.now() + 7000;
				let report = await pipelineService.getReport('pipe_dupes');
				while (
					Date.now() < deadline &&
					(report?.stepResults ?? []).some(
						(step) => step.status === 'running' || step.status === 'queued',
					)
				) {
					await wait(50);
					report = await pipelineService.getReport('pipe_dupes');
				}
				const rows = report?.stepResults ?? [];
				const duplicate = rows.find((row) => row.id === 'dupe_row_a');
				expect(duplicate?.status).toBe('failed');
				expect(duplicate?.errorMessage).toContain('Duplicate in-flight step row');
				// No row may remain in-flight, and no third row may have been created.
				expect(
					rows.every((row) => row.status !== 'running' && row.status !== 'queued'),
				).toBe(true);
				expect(rows.filter((row) => row.sequenceNumber === 1)).toHaveLength(2);
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('startup sweep terminalizes step rows stranded under already-terminal sessions', async () => {
		const workspace = await testTempDir('aidd-pipeline-stranded-');
		const rootDir = await makeRoot();
		try {
			const { pipelineService, runService, sqlite } = makeHarness(rootDir, workspace);
			try {
				sqlite.exec(`
INSERT INTO pipeline_sessions (
	id, recipe_id, recipe_name, project_path, project_name,
	status, current_step_index, total_steps, parameters_json, started_at, completed_at
) VALUES (
	'pipe_terminal', 'gone', 'Gone', '${workspace.replaceAll("'", "''")}', 'workspace',
	'failed', 1, 1, '{}', 1, 2
);
INSERT INTO pipeline_step_results (
	id, session_id, sequence_number, display_order, depth,
	phase, step_name, step_type, status, started_at
) VALUES (
	'stranded_row', 'pipe_terminal', 1, 1, 0, 'step', 'Gone step', 'shell', 'running', 1
);
`);
				await pipelineService.resumeStaleSessions();
				const report = await pipelineService.getReport('pipe_terminal');
				const stranded = report?.stepResults.find((row) => row.id === 'stranded_row');
				expect(stranded?.status).toBe('failed');
				expect(stranded?.errorMessage).toContain('Stranded in-flight step row');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	// Recipes chain review -> remediate and tell the remediation run to act on "the immediately
	// preceding findings", but a managed step is a fresh CLI process whose prompt is built from
	// recipe config alone. Without forwarding, the findings never arrived. Proven end-to-end here
	// on the launched argv, since that is what the child agent actually receives.
	test('forwards the preceding step output into an opted-in step launch argv', async () => {
		const workspace = await testTempDir('aidd-pipeline-carryover-');
		const rootDir = await makeRoot(heartbeatTerminator());
		try {
			const projectDir = await makeProject(workspace);
			const { pipelineService, recipeService, runService, sqlite } = makeHarness(
				rootDir,
				workspace,
			);
			try {
				await recipeService.writeRecipe({
					id: 'carryover',
					name: 'Carryover',
					parameters: [],
					steps: [
						{
							configJson: { command: 'printf "FINDING: the guard is unreachable"' },
							id: 'carryover_step_1',
							name: 'Review',
							stepType: 'shell',
						},
						{
							configJson: {
								includePriorStepOutput: true,
								maxIterations: 1,
								prompt: 'Remediate the findings.',
							},
							id: 'carryover_step_2',
							name: 'Remediate',
							stepType: 'aidd-cli',
						},
						{
							// No opt-in: this one must keep its prompt verbatim, and must not
							// inherit step 2's output either.
							configJson: { maxIterations: 1, prompt: 'Document the changes.' },
							id: 'carryover_step_3',
							name: 'Document',
							stepType: 'aidd-cli',
						},
					],
				});

				const session = await pipelineService.launchRecipe({
					initiator: 'operator',
					parameters: {},
					projectDir,
					recipeId: 'carryover',
				});
				await waitForReport(pipelineService, session.id);

				const argvRows = sqlite
					.query('SELECT command_args_json FROM runs ORDER BY started_at, id')
					.all() as { command_args_json: null | string }[];
				const prompts = argvRows.map((row) => {
					const argv = JSON.parse(row.command_args_json ?? '[]') as string[];
					// The launcher emits the inline `--prompt=value` spelling so prompt text
					// beginning with dashes survives the CLI arg parser.
					const flag = '--prompt=';
					return argv.find((token) => token.startsWith(flag))?.slice(flag.length) ?? '';
				});
				expect(prompts).toHaveLength(2);
				expect(prompts[0]).toContain('Remediate the findings.');
				expect(prompts[0]).toContain('FINDING: the guard is unreachable');
				expect(prompts[0]).toContain(
					'Findings from the preceding pipeline step ("Review")',
				);
				expect(prompts[1]).toBe('Document the changes.');
			} finally {
				await disposeHarness(pipelineService, runService, sqlite);
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});
});
