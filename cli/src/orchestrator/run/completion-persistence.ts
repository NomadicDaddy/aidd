import type { AiddStore } from 'aidd-shared/metadata/store';
import type { SelectedWork } from 'aidd-shared/modes/types';

import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { buildFeatureBlockingContext } from './blocking-context.ts';
import type { RunEvidence } from './dirty-source-attribution.ts';
import type { FeatureCompletionSnapshot } from './types.ts';

import { runTouchedPath } from './dirty-source-attribution.ts';
import { gitSuccess } from './git-exec.ts';
import { gitDirtySourcePaths } from './git.ts';

const mtimeToleranceMs = 2000;

type CompletionCommitGateInput = {
	completionCommittedDuringGrace: boolean;
	completionFinalizedBeforeBackendExit: boolean;
	dirtySourcePathsAtStart: ReadonlySet<string> | undefined;
	/** What this run provably wrote or named. Only paths it accounts for may disqualify the
	 * ignored-metadata allowance below. */
	evidence: RunEvidence;
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
		// Attribution decides, not dirtiness. A worktree is shared with whoever else is working in
		// it, and an operator editing an unrelated file mid-run used to sink the whole run: the
		// completion was demoted to waiting_approval and the run exited 7 over a file the agent
		// never opened. Residue the run cannot account for is reported at run end (see
		// classifyResidualDirtySourcePaths) and charged to nobody.
		if (!runTouchedPath(input.evidence, input.projectDir, path)) continue;
		if (input.dirtySourcePathsAtStart?.has(path) !== true) return false;
		// A path already dirty at run start is operator state — but once this run also wrote to it,
		// the edit is the run's own uncommitted source work. mtime is the corroborating signal:
		// alone it cannot tell the run's write from a concurrent one, which is why it is reached
		// only for paths already attributed above.
		if (await writtenDuringRun(input.projectDir, path, input.startedAtMs)) return false;
	}
	return true;
}

/** An iteration that finished a feature but never committed it has not completed anything aidd can
 * stand behind, so every completion it recorded is demoted to `waiting_approval` carrying the
 * failing-gate context. Only features this iteration actually flipped are touched — one that was
 * already completed+passing when the iteration started keeps its status. */
export async function parkCompletionsPendingCommit(input: {
	blockingContext: ReturnType<typeof buildFeatureBlockingContext>;
	completedFeatures: readonly string[];
	parkedAt: string;
	snapshotBefore: FeatureCompletionSnapshot;
	store: AiddStore;
}): Promise<void> {
	for (const featureId of input.completedFeatures) {
		if (input.snapshotBefore.completed.get(featureId) === true) continue;
		const feature = await input.store.readFeature(featureId);
		if (feature.status !== 'completed' && feature.passes !== true) continue;
		await input.store.writeFeature({
			...feature,
			blockingContext: input.blockingContext,
			passes: false,
			status: 'waiting_approval',
			updatedAt: input.parkedAt,
		});
	}
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

/** Whether the file changed on disk within this run's window. An unstattable path (deleted
 * mid-run) counts as written. Only meaningful for paths already attributed to the run — see the
 * call site. */
async function writtenDuringRun(
	projectDir: string,
	relativePath: string,
	startedAtMs: number,
): Promise<boolean> {
	const pathStat = await stat(join(projectDir, relativePath)).catch(() => undefined);
	if (pathStat === undefined) return true;
	return pathStat.mtimeMs + mtimeToleranceMs >= startedAtMs;
}
