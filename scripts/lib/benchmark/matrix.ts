import { createHash } from 'node:crypto';

import type {
	BenchmarkArgs,
	BenchmarkManifest,
	BenchmarkRun,
	BenchmarkStack,
	BenchmarkTask,
	RunMatrixItem,
} from './types.ts';

export function selectManifest(
	manifest: BenchmarkManifest,
	args: BenchmarkArgs
): { stacks: BenchmarkStack[]; tasks: BenchmarkTask[] } {
	const selectedStackSet = new Set(args.selectedStacks);
	const selectedTaskSet = new Set(args.selectedTasks);
	return {
		stacks:
			selectedStackSet.size > 0
				? manifest.stacks.filter((stack) => selectedStackSet.has(stack.label))
				: manifest.stacks,
		tasks:
			selectedTaskSet.size > 0
				? manifest.tasks.filter((task) => selectedTaskSet.has(task.id))
				: manifest.tasks,
	};
}

function seededRandom(seed: string): () => number {
	let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0xffffffff;
	};
}

function shuffle<T>(items: T[], seed: string | undefined): T[] {
	const out = [...items];
	const random = seed ? seededRandom(seed) : Math.random;
	for (let index = out.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		const current = out[index];
		const swap = out[swapIndex];
		if (current === undefined || swap === undefined) continue;
		out[index] = swap;
		out[swapIndex] = current;
	}
	return out;
}

export function buildRunMatrix(
	manifest: BenchmarkManifest,
	stacks: BenchmarkStack[],
	tasks: BenchmarkTask[],
	seed?: string
): RunMatrixItem[] {
	const matrix: RunMatrixItem[] = [];
	for (const stack of stacks) {
		for (const task of tasks) {
			const warmups = task.warmupRepetitions ?? manifest.settings.warmupRepetitions;
			const repetitions = task.scoredRepetitions ?? manifest.settings.scoredRepetitions;
			for (let index = 0; index < warmups; index += 1) {
				matrix.push({ replicate: index, stack, task, warmup: true });
			}
			for (let index = 0; index < repetitions; index += 1) {
				matrix.push({ replicate: index, stack, task, warmup: false });
			}
		}
	}
	return shuffle(matrix, seed);
}

export function runKey(run: Pick<BenchmarkRun, 'replicate' | 'stack' | 'taskId'>): string {
	return `${run.stack.label}\t${run.taskId}\t${run.replicate}`;
}

export function matrixKey(item: RunMatrixItem): string {
	return `${item.stack.label}\t${item.task.id}\t${item.replicate}`;
}
