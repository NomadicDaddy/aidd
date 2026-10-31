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
	rootDir,
	teammateContent,
} from './_helpers/pre-existing-paths-fixture.ts';

// The rules Morticia's review of 961d3f7 asked for, from the watch's own surface: what a directive
// may be delegated, a second change to a reported path, when a file is read, and non-ASCII names.

const tmpRoot = join(rootDir, '.tmp-pre-existing-paths-rules-tests');
const toolEvent = { args: {}, tool: 'bash', type: 'tool_call' } as const;

function planFor(projectDir: string, mode: string, readonly = false): RunPlan {
	return {
		mode,
		projectDir,
		prompt: readonly ? { customDirectiveReadonly: true } : {},
	} as unknown as RunPlan;
}

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

	test('a directive that only stages or commits is reported without the amber outcome', () => {
		const summary = preExistingChangeSummary(accWith(committed), planFor('.', 'directive'));
		expect(summary).toContain('a.ts');
		expect(summary).not.toContain('preexisting_paths_changed:');
		expect(outcomeLabel(summary)).toBe('Completed');
	});

	test('a directive that changes the content is not delegated', () => {
		const changes: PreExistingChange[] = [...committed, { how: 'changed', path: 'b.ts' }];
		const summary = preExistingChangeSummary(accWith(changes), planFor('.', 'directive'));
		expect(outcomeLabel(summary)).toBe('Completed · existing work changed');
		expect(summary).toContain('b.ts');
		expect(summary).not.toContain('a.ts');
	});

	test('a read-only directive and a coding run committing the same file are not delegated', () => {
		for (const plan of [planFor('.', 'directive', true), planFor('.', 'coding')]) {
			const summary = preExistingChangeSummary(accWith(committed), plan);
			expect(outcomeLabel(summary)).toBe('Completed · existing work changed');
		}
	});

	test('a directive that only commits gets no do-not-touch note', async () => {
		const store = await makeProject('delegated-note', tmpRoot);
		const plan = planFor(store.projectDir, 'directive');
		const { acc, toolCall } = await watching(store.projectDir, [dirtyPath], plan);
		await Bun.spawn(['git', '-C', store.projectDir, 'add', dirtyPath], {
			stderr: 'ignore',
			stdout: 'ignore',
			windowsHide: true,
		}).exited;
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
