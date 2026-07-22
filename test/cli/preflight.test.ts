import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { parseArgs } from 'aidd-shared/args/index';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import type { ResolvedConfig } from 'aidd-shared/config';
import { createModeHandler } from '../../cli/src/modes/factory.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import {
	checkExplicitCompletedFeature,
	writeCompletedFeatureRunSummary,
} from '../../cli/src/preflight-completed.ts';
import {
	applyInitialPhaseDetection,
	clearStaleStopFile,
	handleStopSignal,
	shouldDetectInitialPhase,
} from '../../cli/src/preflight.ts';

import { testTempDir } from '../_helpers/temp.ts';
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
};

const tmpRoot = join(import.meta.dir, '..', '..', '.tmp-preflight-completed-tests');

afterEach(async () => {
	await rm(tmpRoot, { recursive: true, force: true });
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

	test('creates and clears a resolved custom stop signal path', async () => {
		const projectDir = await testTempDir('aidd-preflight-custom-');
		const stopFile = join(projectDir, '.aidd', 'custom.stop');
		await handleStopSignal(
			parseArgs(['--project-dir', projectDir, '--stop']),
			projectDir,
			stopFile
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
			})
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
			config
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
			config
		);

		const result = await checkExplicitCompletedFeature(plan, store);

		expect(result).not.toBeUndefined();
		expect(result!.featureId).toBe('feature-target');
	});

	test('returns undefined when no explicit feature target', async () => {
		const store = await makeProjectStore('no-target');
		const plan = resolveRunPlan(
			parseArgs(['--project-dir', store.projectDir, '--cli', 'native']),
			config
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
			config
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
			config
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
			config
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
			config
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
			config
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
			config
		);
		const result = await checkExplicitCompletedFeature(plan, store);
		expect(result).not.toBeUndefined();

		await writeCompletedFeatureRunSummary(store, plan, result!, {
			aiddDirty: false,
			aiddRevision: '0123456789abcdef',
			aiddVersion: '2.125.0',
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
		expect(summary.aiddVersion).toBe('2.125.0');
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
			config
		);
	}

	/** A project with code but no onboarding artifacts — detectInitialPhase says 'onboarding'. */
	async function unOnboardedProject(name: string): Promise<string> {
		const projectDir = join(tmpRoot, name);
		await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
		await writeFile(join(projectDir, 'index.ts'), 'export const app = 1;\n');
		return projectDir;
	}

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
