import type { AiddStore } from 'aidd-shared/metadata/store';
import type { SelectedWork } from 'aidd-shared/modes/types';

import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { gitSuccess } from './git-exec.ts';
import { gitDirtySourcePaths } from './git.ts';

const mtimeToleranceMs = 2000;

type CompletionCommitGateInput = {
	completionCommittedDuringGrace: boolean;
	completionFinalizedBeforeBackendExit: boolean;
	dirtySourcePathsAtStart: ReadonlySet<string> | undefined;
	gitHeadBefore: string | undefined;
	iterationCommitCount: number;
	projectDir: string;
	startedAtMs: number;
	store: AiddStore;
	work: SelectedWork;
};

export async function completionRequiresCommit(input: CompletionCommitGateInput): Promise<boolean> {
	if (
		!input.completionFinalizedBeforeBackendExit ||
		input.gitHeadBefore === undefined ||
		input.iterationCommitCount > 0 ||
		input.completionCommittedDuringGrace
	) {
		return false;
	}
	return !(await ignoredMetadataCompletionSatisfiesCommitGate(input));
}

async function ignoredMetadataCompletionSatisfiesCommitGate(
	input: CompletionCommitGateInput,
): Promise<boolean> {
	if (input.work.kind !== 'feature' || input.dirtySourcePathsAtStart === undefined) return false;
	const feature = await input.store.readFeature(input.work.id).catch(() => undefined);
	if (feature === undefined || feature.status !== 'completed' || feature.passes !== true) {
		return false;
	}
	const directory = feature.directory ?? feature.id;
	const relativePath = `.aidd/features/${directory}/feature.json`;
	const ignored = await gitSuccess(input.projectDir, [
		'check-ignore',
		'-q',
		'--no-index',
		'--',
		relativePath,
	]);
	if (!ignored) return false;
	const featureStat = await stat(join(input.projectDir, relativePath)).catch(() => undefined);
	if (featureStat === undefined || featureStat.mtimeMs + mtimeToleranceMs < input.startedAtMs) {
		return false;
	}
	const dirtySourcePaths = await gitDirtySourcePaths(input.projectDir);
	if (dirtySourcePaths === undefined) return false;
	for (const path of dirtySourcePaths) {
		if (input.dirtySourcePathsAtStart?.has(path) !== true) return false;
		if (await writtenDuringRun(input.projectDir, path, input.startedAtMs)) return false;
	}
	return true;
}

/** Simulation runs have no real agent to write the feature back, so the orchestrator applies the
 * completion the simulated result claims. Guarded the same way a real one is: the claim must name
 * the feature this iteration selected, and something must actually have been committed — otherwise
 * a simulation would flip features to completed on no evidence at all. */
export async function applySimulatedFeatureCompletion(input: {
	iterationCommitCount: number;
	store: AiddStore;
	structuredResult: { featureId?: string; passes?: boolean; status?: string } | undefined;
	work: SelectedWork;
}): Promise<void> {
	const { iterationCommitCount, store, structuredResult, work } = input;
	if (
		work.kind !== 'feature' ||
		structuredResult?.featureId !== work.id ||
		structuredResult.status !== 'completed' ||
		structuredResult.passes !== true
	) {
		return;
	}
	const feature = await store.readFeature(work.id);
	if (feature.status === 'completed' && feature.passes === true) return;
	if (iterationCommitCount === 0) return;
	await store.writeFeature({
		...feature,
		passes: true,
		status: 'completed',
		updatedAt: new Date().toISOString(),
	});
}

/** A path already dirty at run start is operator state the run must not claim — but only while the
 * run leaves it alone. Once this iteration writes to it, the edit is the run's own uncommitted
 * source work, and the ignored-metadata allowance must not excuse it just because the path was
 * dirty beforehand. An unstattable path (deleted mid-run) counts as written. */
async function writtenDuringRun(
	projectDir: string,
	relativePath: string,
	startedAtMs: number,
): Promise<boolean> {
	const pathStat = await stat(join(projectDir, relativePath)).catch(() => undefined);
	if (pathStat === undefined) return true;
	return pathStat.mtimeMs + mtimeToleranceMs >= startedAtMs;
}
