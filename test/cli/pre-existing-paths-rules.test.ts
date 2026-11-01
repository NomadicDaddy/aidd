import { afterEach, describe, expect, test } from 'bun:test';
import { stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunPlan } from 'aidd-shared/plan/types';
import { classifyWebRun } from 'aidd-shared/runs/outcome';
import type { RunObserver } from '../../cli/src/orchestrator/orchestrator.ts';
import type {
	OrchestratorDeps,
	PreExistingChange,
	RunAccumulator,
} from '../../cli/src/orchestrator/run/types.ts';
import { gitDirtySourcePaths } from '../../cli/src/orchestrator/run/git.ts';
import {
	capturePreExistingPathWatch,
	preExistingChangeSummary,
	settlePreExistingPathWatch,
	withPreExistingPathWatch,
} from '../../cli/src/orchestrator/run/pre-existing-paths.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import {
	committedContent,
	dirtyPath,
	makeProject,
	resolvePlan,
	rootDir,
	runGit,
	teammateContent,
} from './_helpers/pre-existing-paths-fixture.ts';

// The rules Morticia's review of 961d3f7 asked for, from the watch's own surface: what a directive
// may be delegated, a second change to a reported path, when a file is read, and non-ASCII names.

const tmpRoot = join(rootDir, '.tmp-pre-existing-paths-rules-tests');
const toolEvent = { args: {}, tool: 'bash', type: 'tool_call' } as const;

function planFor(projectDir: string, mode: string, prompt: Record<string, unknown> = {}): RunPlan {
	return { mode, projectDir, prompt } as unknown as RunPlan;
}

const commitSkill = { skillId: 'commit-bundles' };

function accWith(changes: PreExistingChange[]): RunAccumulator {
	return {
		pendingCarryoverNotes: [],
		preExistingPathWatch: { changes },
	} as unknown as RunAccumulator;
}

function outcomeLabel(summary: string | undefined): string {
	return classifyWebRun({
		exitCode: 0,
		status: 'completed',
		stopReason: 'completed',
		summary: summary ?? null,
	}).label;
}

/** A live watch over a project's dirty files, with a way to fire one tool event at it. */
async function watching(projectDir: string, paths: string[], plan: RunPlan) {
	const watch = await capturePreExistingPathWatch(projectDir, paths);
	const acc = {
		pendingCarryoverNotes: [],
		preExistingPathWatch: watch,
	} as unknown as RunAccumulator;
	const deps = withPreExistingPathWatch({} as OrchestratorDeps, acc, plan);
	const observer = deps.observer as RunObserver;
	return { acc, toolCall: async () => observer.onAgentEvent?.(toolEvent) };
}

function hows(acc: RunAccumulator, path: string): string[] {
	return (acc.preExistingPathWatch?.iterationChanges ?? [])
		.filter((change) => change.path === path)
		.map((change) => change.how);
}

afterEach(async () => {
	await removeTempTree(tmpRoot);
});

describe('what a run may be delegated', () => {
	const committed: PreExistingChange[] = [
		{ how: 'staged', path: 'a.ts' },
		{ how: 'committed', path: 'a.ts' },
	];

	test('a commit skill that only stages or commits gets a neutral label, not plain Completed', () => {
		const plan = planFor('.', 'directive', commitSkill);
		const summary = preExistingChangeSummary(accWith(committed), plan);
		expect(summary).toContain('a.ts');
		expect(summary).toContain('commit-bundles');
		expect(outcomeLabel(summary)).toBe('Completed · existing work committed');
		const outcome = classifyWebRun({
			exitCode: 0,
			status: 'completed',
			stopReason: 'completed',
			summary: summary ?? null,
		});
		expect(outcome.tone).toBe('neutral');
	});

	test('the neutral label never hides a dirty tree the run left', () => {
		const plan = planFor('.', 'directive', commitSkill);
		const summary = preExistingChangeSummary(accWith(committed), plan);
		const withDirt = `${summary ?? ''}; uncommitted_source_files: this run left 1 source file(s)`;
		expect(outcomeLabel(withDirt)).toBe('Completed · dirty tree');
	});

	test('a commit skill that changes content is not delegated, and every path is named', () => {
		const changes: PreExistingChange[] = [...committed, { how: 'changed', path: 'b.ts' }];
		const plan = planFor('.', 'directive', commitSkill);
		const summary = preExistingChangeSummary(accWith(changes), plan);
		expect(outcomeLabel(summary)).toBe('Completed · existing work changed');
		expect(summary).toContain('b.ts');
		expect(summary).toContain('a.ts');
	});

	test('committing is not delegated to anything but a writable commit skill', () => {
		const plans = [
			planFor('.', 'coding'),
			planFor('.', 'directive'),
			planFor('.', 'directive', { skillId: 'feature-review' }),
			planFor('.', 'directive', { ...commitSkill, customDirectiveReadonly: true }),
		];
		for (const plan of plans) {
			const summary = preExistingChangeSummary(accWith(committed), plan);
			expect(outcomeLabel(summary)).toBe('Completed · existing work changed');
		}
	});

	test('a real --skill launch carries the skill the rule reads', () => {
		const prompt = resolvePlan('.', ['--directive', '--skill', 'commit-bundles']).prompt;
		expect(prompt.skillId).toBe('commit-bundles');
	});

	test('an ordinary directive that stages a file is told about it', async () => {
		const store = await makeProject('undelegated-note', tmpRoot);
		const plan = planFor(store.projectDir, 'directive');
		const { acc, toolCall } = await watching(store.projectDir, [dirtyPath], plan);
		await runGit(store.projectDir, ['add', dirtyPath]);
		await toolCall();
		await settlePreExistingPathWatch(acc, plan, undefined, undefined);
		expect(acc.pendingCarryoverNotes.join('')).toContain(dirtyPath);
	});

	test('a commit skill that only stages gets no do-not-touch note', async () => {
		const store = await makeProject('delegated-note', tmpRoot);
		const plan = planFor(store.projectDir, 'directive', commitSkill);
		const { acc, toolCall } = await watching(store.projectDir, [dirtyPath], plan);
		await runGit(store.projectDir, ['add', dirtyPath]);
		await toolCall();
		await settlePreExistingPathWatch(acc, plan, undefined, undefined);
		expect(hows(acc, dirtyPath)).toEqual(['staged']);
		expect(acc.pendingCarryoverNotes).toEqual([]);
	});
});

describe('the watch', () => {
	test('a path reported in one iteration is reported again when it changes in a later one', async () => {
		const store = await makeProject('second-change', tmpRoot);
		const path = join(store.projectDir, dirtyPath);
		const plan = planFor(store.projectDir, 'coding');
		const { acc, toolCall } = await watching(store.projectDir, [dirtyPath], plan);

		await writeFile(path, committedContent);
		await toolCall();
		await settlePreExistingPathWatch(acc, plan, undefined, undefined);
		expect(hows(acc, dirtyPath)).toEqual(['changed']);

		await settlePreExistingPathWatch(acc, plan, undefined, undefined);
		expect(hows(acc, dirtyPath)).toEqual([]);

		await writeFile(path, 'export const a = 3;\n');
		await toolCall();
		await settlePreExistingPathWatch(acc, plan, undefined, undefined);
		expect(hows(acc, dirtyPath)).toEqual(['changed']);
	});

	test('a file whose size and write time held is not read again', async () => {
		const store = await makeProject('stat-short-circuit', tmpRoot);
		const path = join(store.projectDir, dirtyPath);
		const plan = planFor(store.projectDir, 'coding');
		const { acc, toolCall } = await watching(store.projectDir, [dirtyPath], plan);
		const before = await stat(path);

		// Different bytes of the same length under the old write time: visible only to a re-read,
		// which is the cost stated at readFileState.
		await writeFile(path, teammateContent.replace('2', '3'));
		await utimes(path, before.atime, before.mtime);
		await toolCall();
		await settlePreExistingPathWatch(acc, plan, undefined, undefined);
		expect(hows(acc, dirtyPath)).toEqual([]);
	});

	test('a non-ASCII path is watched under its real name', async () => {
		const store = await makeProject('non-ascii', tmpRoot);
		const name = 'src/café.ts';
		await writeFile(join(store.projectDir, name), 'export const b = 1;\n');
		const dirty = (await gitDirtySourcePaths(store.projectDir)) ?? [];
		expect(dirty).toContain(name);

		const plan = planFor(store.projectDir, 'coding');
		const { acc, toolCall } = await watching(store.projectDir, dirty, plan);
		await writeFile(join(store.projectDir, name), 'export const b = 22;\n');
		await toolCall();
		await settlePreExistingPathWatch(acc, plan, undefined, undefined);
		expect(hows(acc, name)).toEqual(['changed']);
	});
});
