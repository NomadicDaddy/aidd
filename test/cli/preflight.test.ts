import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { parseArgs } from 'aidd-shared/args/index';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { defaultWebConfig, type ResolvedConfig } from 'aidd-shared/config';
import { createModeHandler } from '../../cli/src/modes/factory.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { handleDirtyTreeSkip } from '../../cli/src/orchestrator/run/preflight.ts';
import type { OrchestratorDeps, RunAccumulator } from '../../cli/src/orchestrator/run/types.ts';
import {
	checkExplicitCompletedFeature,
	writeCompletedFeatureRunSummary,
} from '../../cli/src/preflight-completed.ts';
import {
	applyInitialPhaseDetection,
	assertProjectForRun,
	clearStaleStopFile,
	clearUnclaimedProjectStopFile,
	handleStopSignal,
	shouldDetectInitialPhase,
} from '../../cli/src/preflight.ts';
import {
	createCliActiveRunRecord,
	writeCliActiveRunRecord,
} from '../../shared/src/metadata/active-runs.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
const config: ResolvedConfig = {
	cli: 'native',
	reasoningEffort: 'low',
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	timeoutSeconds: 3600,
	preflightDoctor: false,
	idleTimeoutSeconds: 1,
	idleNudgeTimeoutSeconds: 1,
	dirtyTreeThreshold: 50,
	noWorkBackoffMs: 0,
	noClean: false,
	quitOnAbort: 0,
	rateLimitBufferSeconds: 60,
	rateLimitBackoffSeconds: 300,
	web: defaultWebConfig,
};

const tmpRoot = join(import.meta.dir, '..', '..', '.tmp-preflight-completed-tests');

afterEach(async () => {
	await removeTempTree(tmpRoot);
});

describe('preflight compatibility', () => {
	test('creates and clears default stop signal files', async () => {
		const projectDir = await testTempDir('aidd-preflight-');
		await handleStopSignal(parseArgs(['--project-dir', projectDir, '--stop']));

		const stopFile = join(projectDir, '.aidd', '.stop');
		await expect(readFile(stopFile, 'utf8')).resolves.toContain('T');

		await clearStaleStopFile(projectDir);
		await expect(readFile(stopFile, 'utf8')).rejects.toThrow();

		await writeFile(stopFile, 'stale\n');
		await clearStaleStopFile(projectDir);
		await expect(readFile(stopFile, 'utf8')).rejects.toThrow();
	});

	// The CLI clears the project-wide stop file at startup, before its own record exists. If another
	// run is live, the stop may be meant for it, and erasing it leaves that run unstoppable.
	test('keeps the project stop file while another run may be its target', async () => {
		const projectDir = await testTempDir('aidd-preflight-claimed-');
		await handleStopSignal(parseArgs(['--project-dir', projectDir, '--stop']));
		const stopFile = join(projectDir, '.aidd', '.stop');
		await writeCliActiveRunRecord({
			...createCliActiveRunRecord({
				backend: 'codex',
				id: 'run_sibling',
				mode: 'coding',
				model: undefined,
				projectDir,
				provider: undefined,
				reasoningEffort: 'low',
			}),
			state: 'running',
		});

		await clearUnclaimedProjectStopFile(projectDir);
		await expect(readFile(stopFile, 'utf8')).resolves.toContain('T');

		await writeCliActiveRunRecord({
			...createCliActiveRunRecord({
				backend: 'codex',
				id: 'run_sibling',
				mode: 'coding',
				model: undefined,
				projectDir,
				provider: undefined,
				reasoningEffort: 'low',
			}),
			state: 'completed',
		});
		await clearUnclaimedProjectStopFile(projectDir);
		await expect(readFile(stopFile, 'utf8')).rejects.toThrow();
	});

	test('creates and clears a resolved custom stop signal path', async () => {
		const projectDir = await testTempDir('aidd-preflight-custom-');
		const stopFile = join(projectDir, '.aidd', 'custom.stop');
		await handleStopSignal(
			parseArgs(['--project-dir', projectDir, '--stop']),
			projectDir,
			stopFile,
		);

		await expect(readFile(stopFile, 'utf8')).resolves.toContain('T');

		await clearStaleStopFile(projectDir, stopFile);
		await expect(readFile(stopFile, 'utf8')).rejects.toThrow();
	});
});

describe('explicit completed feature exit', () => {
	async function makeProjectStore(name: string): Promise<FileAiddStore> {
		const projectDir = join(tmpRoot, name);
		const featuresDir = join(projectDir, '.aidd', 'features', 'feature-target');
		await mkdir(featuresDir, { recursive: true });
		await writeFile(
			join(featuresDir, 'feature.json'),
			JSON.stringify({
				id: 'feature-target',
				title: 'Target feature',
				status: 'completed',
				passes: true,
				priority: 1,
			}),
		);
		// Intentionally do NOT create spec.md — this simulates the real
		// scenario where detectInitialPhase would rewrite coding to onboarding.
		return new FileAiddStore(projectDir);
	}

	test('returns result for an explicit --feature targeting a completed feature', async () => {
		const store = await makeProjectStore('completed-feature');
		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--feature',
				'feature-target',
			]),
			config,
		);

		const result = await checkExplicitCompletedFeature(plan, store);

		expect(result).not.toBeUndefined();
		expect(result!.featureId).toBe('feature-target');
		expect(result!.message).toContain('already completed');
		expect(result!.message).toContain('feature-target');
	});

	test('returns result for --filter-by id targeting a completed feature', async () => {
		const store = await makeProjectStore('completed-filter');
		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--filter-by',
				'id',
				'--filter',
				'feature-target',
			]),
			config,
		);

		const result = await checkExplicitCompletedFeature(plan, store);

		expect(result).not.toBeUndefined();
		expect(result!.featureId).toBe('feature-target');
	});

	test('returns undefined when no explicit feature target', async () => {
		const store = await makeProjectStore('no-target');
		const plan = resolveRunPlan(
			parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
			config,
		);

		const result = await checkExplicitCompletedFeature(plan, store);

		expect(result).toBeUndefined();
	});

	test('returns undefined when explicit feature is incomplete', async () => {
		const store = await makeProjectStore('incomplete-feature');
		await store.writeFeature({
			id: 'feature-target',
			title: 'Target feature',
			status: 'in_progress',
			passes: false,
			priority: 1,
		});

		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--feature',
				'feature-target',
			]),
			config,
		);

		const result = await checkExplicitCompletedFeature(plan, store);

		expect(result).toBeUndefined();
	});

	test('returns undefined when explicit feature has waiting_approval status', async () => {
		const store = await makeProjectStore('waiting-approval-feature');
		await store.writeFeature({
			id: 'feature-target',
			title: 'Target feature',
			status: 'waiting_approval',
			passes: false,
			priority: 1,
		});

		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--feature',
				'feature-target',
			]),
			config,
		);

		const result = await checkExplicitCompletedFeature(plan, store);

		expect(result).toBeUndefined();
	});

	test('returns undefined when explicit feature is backlog and passes false', async () => {
		const store = await makeProjectStore('backlog-feature');
		await store.writeFeature({
			id: 'feature-target',
			title: 'Target feature',
			status: 'backlog',
			passes: false,
			priority: 1,
		});

		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--feature',
				'feature-target',
			]),
			config,
		);

		const result = await checkExplicitCompletedFeature(plan, store);

		expect(result).toBeUndefined();
	});

	test('returns undefined when feature does not exist', async () => {
		const store = await makeProjectStore('missing-feature');

		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--feature',
				'feature-nonexistent',
			]),
			config,
		);

		const result = await checkExplicitCompletedFeature(plan, store);

		expect(result).toBeUndefined();
	});

	test('returns undefined when filter-by uses a wildcard', async () => {
		const store = await makeProjectStore('wildcard-filter');
		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--filter-by',
				'id',
				'--filter',
				'feature-*',
			]),
			config,
		);

		const result = await checkExplicitCompletedFeature(plan, store);

		expect(result).toBeUndefined();
	});

	test('writeCompletedFeatureRunSummary persists a run with selected and completed features', async () => {
		const store = await makeProjectStore('run-summary');
		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				store.projectDir,
				'--cli',
				'native',
				'--feature',
				'feature-target',
			]),
			config,
		);
		const result = await checkExplicitCompletedFeature(plan, store);
		expect(result).not.toBeUndefined();

		await writeCompletedFeatureRunSummary(store, plan, result!, {
			aiddDirty: false,
			aiddRevision: '0123456789abcdef',
			aiddVersion: '3.0.0',
		});

		const runs = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const summary = JSON.parse(runs.trim()) as {
			aiddDirty: boolean | null;
			aiddRevision: null | string;
			aiddVersion: null | string;
			selectedFeatures: string[];
			completedFeatures: string[];
			stopReason: string;
			exitCode: number;
			summary: string;
		};
		expect(summary.aiddDirty).toBe(false);
		expect(summary.aiddRevision).toBe('0123456789abcdef');
		expect(summary.aiddVersion).toBe('3.0.0');
		expect(summary.selectedFeatures).toEqual(['feature-target']);
		expect(summary.completedFeatures).toEqual(['feature-target']);
		expect(summary.stopReason).toBe('already_completed');
		expect(summary.exitCode).toBe(0);
		expect(summary.summary).toContain('already completed');
	});
});

describe('automatic phase detection routing', () => {
	function makePlan(projectDir: string, extraArgs: string[] = []) {
		return resolveRunPlan(
			parseArgs(['--project-dir', projectDir, '--cli', 'native', ...extraArgs]),
			config,
		);
	}

	/** A project with code but no onboarding artifacts — detectInitialPhase says 'onboarding'. */
	async function unOnboardedProject(name: string): Promise<string> {
		const projectDir = join(tmpRoot, name);
		await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
		await writeFile(join(projectDir, 'index.ts'), 'export const app = 1;\n');
		return projectDir;
	}

	/**
	 * A project an initializer left mid-blueprint: one product feature, spec, and CHANGELOG (so
	 * detectInitialPhase reads coding) but no roadmap, with the given phases in the run ledger.
	 */
	async function halfBlueprintProject(name: string, ledgerPhases: string[]): Promise<string> {
		const projectDir = await unOnboardedProject(name);
		const featureDir = join(projectDir, '.aidd', 'features', 'first-feature');
		await mkdir(featureDir, { recursive: true });
		await writeFile(
			join(featureDir, 'feature.json'),
			JSON.stringify({ id: 'first-feature', passes: false, status: 'backlog' }),
		);
		await writeFile(join(projectDir, '.aidd', 'spec.md'), '# Spec\n');
		await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Changelog\n');
		const ledger = ledgerPhases.map((phase) => JSON.stringify({ mode: 'coding', phase }));
		await writeFile(join(projectDir, '.aidd', 'runs.jsonl'), `${ledger.join('\n')}\n`);
		return projectDir;
	}

	test('resumes an initializer that stopped before its blueprint was complete', async () => {
		const projectDir = await halfBlueprintProject('resume-initializer', ['initializer']);
		const plan = makePlan(projectDir);

		await applyInitialPhaseDetection(plan);

		expect(plan.prompt.phase).toBe('initializer');
		expect(plan.prompt.fragments).toContainEqual({
			id: 'initializer',
			kind: 'phase',
			path: 'prompts/initializer.md',
		});
	});

	// The project's own repository, with nothing committed: the readiness verdict an initializer
	// gets when it wrote a complete blueprint and stopped before committing it.
	test('resumes an initializer whose complete blueprint is not yet committed', async () => {
		const projectDir = await halfBlueprintProject('uncommitted-blueprint', ['initializer']);
		Bun.spawnSync(['git', 'init', '-q'], { cwd: projectDir, windowsHide: true });
		await writeFile(
			join(projectDir, '.aidd', 'roadmap.json'),
			JSON.stringify({
				features: { 'first-feature': { milestone: 'MVP' } },
				milestones: { MVP: { priority: 1 } },
			}),
		);
		const plan = makePlan(projectDir);

		await applyInitialPhaseDetection(plan);

		expect(plan.prompt.phase).toBe('initializer');
	});

	test('codes after completed onboarding without an initializer blueprint', async () => {
		const projectDir = await halfBlueprintProject('completed-onboarding', ['onboarding']);
		const store = new FileAiddStore(projectDir);
		await store.writeFeature({
			id: 'first-feature',
			passes: false,
			status: 'waiting_approval',
		});
		const onboardingPlan = makePlan(projectDir);
		onboardingPlan.prompt.phase = 'onboarding';
		const result = await createModeHandler(onboardingPlan).processResult(
			{ projectDir, store },
			{ events: [], exitCode: 0, filesModified: [], transcript: '' },
		);
		expect(result.complete).toBe(true);

		const nextPlan = makePlan(projectDir);
		await applyInitialPhaseDetection(nextPlan);

		expect(nextPlan.prompt.phase).toBe('coding');
		expect(nextPlan.prompt.fragments).toContainEqual({
			id: 'coding',
			kind: 'phase',
			path: 'prompts/coding.md',
		});
	});

	test('codes a half-made blueprint once a coding run has followed the setup phase', async () => {
		const projectDir = await halfBlueprintProject('coded-after-setup', [
			'initializer',
			'coding',
		]);
		const plan = makePlan(projectDir);

		await applyInitialPhaseDetection(plan);

		expect(plan.prompt.phase).toBe('coding');
	});

	test('keeps automatic phase detection for untargeted coding runs', () => {
		const plan = makePlan(join(tmpRoot, 'untargeted'));

		expect(shouldDetectInitialPhase(plan)).toBe(true);
	});

	test('keeps an explicit incomplete feature in coding mode', () => {
		const plan = makePlan(join(tmpRoot, 'feature-target'), ['--feature', 'feature-target']);

		expect(shouldDetectInitialPhase(plan)).toBe(false);
	});

	test('keeps an exact id-filter target in coding mode', () => {
		const plan = makePlan(join(tmpRoot, 'filter-target'), [
			'--filter-by',
			'id',
			'--filter',
			'feature-target',
		]);

		expect(shouldDetectInitialPhase(plan)).toBe(false);
	});

	test('keeps an audit-findings sweep in coding mode on an un-onboarded project', async () => {
		const projectDir = await unOnboardedProject('audit-findings-target');
		const plan = makePlan(projectDir, ['--audit-findings']);

		await applyInitialPhaseDetection(plan);

		expect(shouldDetectInitialPhase(plan)).toBe(false);
		expect(plan.prompt.phase).toBe('coding');
	});

	test('keeps a wildcard id filter in coding mode', () => {
		// A filter is a selection, wildcard or not: the caller named the work. Detection is for the
		// run that asked for nothing at all.
		const plan = makePlan(join(tmpRoot, 'wildcard-target'), [
			'--filter-by',
			'id',
			'--filter',
			'feature-*',
		]);

		expect(shouldDetectInitialPhase(plan)).toBe(false);
	});

	test('keeps a non-id filter in coding mode', () => {
		// --filter-by accepts any of a dozen Feature fields, and a run pinned by category is as
		// targeted as one pinned by id; explicitFeatureTarget only recognises the `id` spelling.
		const plan = makePlan(join(tmpRoot, 'category-target'), [
			'--filter-by',
			'category',
			'--filter',
			'Security',
		]);

		expect(shouldDetectInitialPhase(plan)).toBe(false);
	});

	test('keeps the remediation recipes audit-* sweep in coding mode on an un-onboarded project', async () => {
		// The shape both shipped remediation recipes launch (recipes/remediate-audit-findings.json,
		// recipes/remediate-bugs.json). A backlog of only audit findings detects as 'onboarding' by
		// design — which is precisely the population these recipes target, so rewriting the run
		// dropped the sweep and filed new backlog features nobody asked for instead.
		const projectDir = await unOnboardedProject('audit-sweep-target');
		const plan = makePlan(projectDir, ['--filter-by', 'id', '--filter', 'audit-*']);

		await applyInitialPhaseDetection(plan);

		expect(plan.prompt.phase).toBe('coding');
		expect(plan.prompt.fragments).not.toContainEqual({
			id: 'onboarding',
			kind: 'phase',
			path: 'prompts/onboarding.md',
		});
	});

	test('rewrites an untargeted run on an un-onboarded project to the onboarding phase', async () => {
		const projectDir = await unOnboardedProject('untargeted-rewrite');
		const plan = makePlan(projectDir);

		await applyInitialPhaseDetection(plan);

		expect(plan.prompt.phase).toBe('onboarding');
		expect(plan.prompt.fragments).toContainEqual({
			id: 'onboarding',
			kind: 'phase',
			path: 'prompts/onboarding.md',
		});
	});

	test('routes a template scaffold with an explicit spec through the from-idea initializer', async () => {
		const projectDir = await unOnboardedProject('template-from-idea');
		const specPath = join(projectDir, '.aidd', 'spec.md');
		await writeFile(specPath, '# New application spec\n');
		const plan = makePlan(projectDir, ['--spec', specPath, '--stop-before-implementation']);

		await applyInitialPhaseDetection(plan);

		expect(plan.prompt.phase).toBe('initializer');
		expect(plan.prompt.fragments).toContainEqual({
			id: 'initializer',
			kind: 'phase',
			path: 'prompts/initializer.md',
		});
	});

	test('reports no eligible work when an explicit target names nothing on an un-onboarded project', async () => {
		const projectDir = await unOnboardedProject('missing-target');
		const store = new FileAiddStore(projectDir);
		const plan = makePlan(projectDir, ['--feature', 'feature-absent']);

		await applyInitialPhaseDetection(plan);

		// The targeted run keeps its coding phase prompt even though the sibling test above
		// proves detection would have rewritten an untargeted run on this same project.
		expect(plan.prompt.phase).toBe('coding');

		// So it honestly reports nothing to do, rather than detouring into an onboarding
		// prompt that would scaffold a project the caller never asked to scaffold.
		const work = await createModeHandler(plan).selectWork({ projectDir, store });
		expect(work.kind).toBe('none');
	});
});

// A run scaffolds .aidd/ and, in the initializer lane, the root contract into whatever path it is
// handed, creating every missing parent on the way. A mistyped --project-dir therefore produced a
// whole scaffolded project tree at the typo and reported success.
describe('assertProjectForRun project directory', () => {
	test('rejects a project directory that does not exist', async () => {
		const missing = join(await testTempDir('aidd-preflight-missing-'), 'nope', 'deeper');
		await expect(assertProjectForRun(parseArgs(['--project-dir', missing]))).rejects.toThrow(
			'--project-dir does not exist',
		);
	});

	test('rejects a project directory that is a file', async () => {
		const root = await testTempDir('aidd-preflight-file-');
		const file = join(root, 'not-a-dir.txt');
		await writeFile(file, 'x');
		try {
			await expect(assertProjectForRun(parseArgs(['--project-dir', file]))).rejects.toThrow(
				'--project-dir is not a directory',
			);
		} finally {
			await removeTempTree(root);
		}
	});

	test('accepts an existing project directory', async () => {
		const root = await testTempDir('aidd-preflight-ok-');
		try {
			await expect(
				assertProjectForRun(parseArgs(['--project-dir', root])),
			).resolves.toBeUndefined();
		} finally {
			await removeTempTree(root);
		}
	});

	// --web and --director never target a project, so they must not be gated on one existing.
	test('skips the check for modes that do not target a project', async () => {
		await expect(assertProjectForRun(parseArgs(['--web']))).resolves.toBeUndefined();
	});
});

// audit-git-destructive-safety-1790863167: under the threshold the live-tree gate proceeded in
// silence, so the operator was never told their uncommitted work was exposed to the agent.
describe('dirty-tree gate under the threshold', () => {
	async function repoWithCommit(): Promise<string> {
		const dir = await testTempDir('aidd-preflight-dirty-');
		const git = async (...args: string[]): Promise<void> => {
			const proc = Bun.spawn(['git', ...args], {
				cwd: dir,
				stderr: 'pipe',
				stdout: 'pipe',
				windowsHide: true,
			});
			if ((await proc.exited) !== 0) throw new Error(`git ${args.join(' ')} failed`);
		};
		await git('init');
		await git('config', 'user.email', 'test@test');
		await git('config', 'user.name', 'test');
		await writeFile(join(dir, 'tracked.ts'), 'original\n', 'utf8');
		await git('add', 'tracked.ts');
		await git('commit', '-q', '-m', 'init');
		return dir;
	}

	async function gate(dir: string): Promise<{ result: number | undefined; warnings: string[] }> {
		const plan = resolveRunPlan(parseArgs(['--project-dir', dir, '--cli', 'native']), config);
		const warnings: string[] = [];
		const warn = spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
			warnings.push(args.map(String).join(' '));
		});
		try {
			const result = await handleDirtyTreeSkip(
				{ rootDir: dir, store: new FileAiddStore(dir) } as unknown as OrchestratorDeps,
				plan,
				{ runId: 'run-dirty' } as unknown as RunAccumulator,
				1,
				() => {},
			);
			return { result, warnings };
		} finally {
			warn.mockRestore();
		}
	}

	test('one uncommitted file proceeds with a warning naming it and --worktree', async () => {
		const dir = await repoWithCommit();
		try {
			await writeFile(join(dir, 'tracked.ts'), 'edited\n', 'utf8');
			const { result, warnings } = await gate(dir);
			expect(result).toBeUndefined();
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain(
				'1 uncommitted file(s) in the live tree are exposed to the agent',
			);
			expect(warnings[0]).toContain('tracked.ts');
			expect(warnings[0]).toContain('--worktree');
		} finally {
			await removeTempTree(dir);
		}
	});

	test('a clean tree proceeds without a warning', async () => {
		const dir = await repoWithCommit();
		try {
			const { result, warnings } = await gate(dir);
			expect(result).toBeUndefined();
			expect(warnings).toEqual([]);
		} finally {
			await removeTempTree(dir);
		}
	});
});
