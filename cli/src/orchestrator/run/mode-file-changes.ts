import type { IterationDetails } from '../details.ts';
import type { FileChanges } from './git-file-changes.ts';
import type { GitCommitSummary, RunAccumulator } from './types.ts';

import { gitCommitsFileChanges } from './git-file-changes.ts';

export function modeFileChangesFromArtifacts(
	artifacts: Record<string, unknown> | undefined,
): FileChanges {
	return {
		filesCreated: stringArray(artifacts?.modeFilesCreated),
		filesEdited: stringArray(artifacts?.modeFilesEdited),
	};
}

/** The file changes to record on top of what the backend's tool events reported. Normally that is
 * just whatever the mode contributed; when nothing at all was reported — a shell-only backend, so
 * no Write/Edit events exist to parse — the iteration's commits stand in, so the run's file
 * evidence reflects what landed instead of claiming the run touched nothing. */
export async function resolveIterationFileChanges(input: {
	commits: readonly GitCommitSummary[];
	details: IterationDetails;
	modeArtifacts: Record<string, unknown> | undefined;
	projectDir: string;
}): Promise<FileChanges> {
	const modeChanges = modeFileChangesFromArtifacts(input.modeArtifacts);
	const reportedAnything =
		input.details.filesCreated.length > 0 ||
		input.details.filesEdited.length > 0 ||
		modeChanges.filesCreated.length > 0 ||
		modeChanges.filesEdited.length > 0;
	if (reportedAnything || input.commits.length === 0) return modeChanges;
	return await gitCommitsFileChanges(
		input.projectDir,
		input.commits.map((commit) => commit.hash),
	);
}

export function accumulateAdditionalFileChanges(
	acc: RunAccumulator,
	fileChanges: FileChanges,
): void {
	for (const path of fileChanges.filesCreated) {
		if (acc.filesCreated.has(path)) continue;
		acc.filesCreated.add(path);
		acc.runTotals.filesCreated++;
	}
	for (const path of fileChanges.filesEdited) {
		if (acc.filesEdited.has(path)) continue;
		acc.filesEdited.add(path);
		acc.runTotals.filesEdited++;
	}
}

export function mergeModeFileChanges(
	details: IterationDetails,
	modeFileChanges: FileChanges,
): IterationDetails {
	const filesCreated = uniqueOrdered([...details.filesCreated, ...modeFileChanges.filesCreated]);
	const filesEdited = uniqueOrdered([...details.filesEdited, ...modeFileChanges.filesEdited]);
	if (
		filesCreated.length === details.filesCreated.length &&
		filesEdited.length === details.filesEdited.length
	) {
		return details;
	}
	return {
		...details,
		filesCreated,
		filesEdited,
		summary: {
			...details.summary,
			uniqueFilesCreated: filesCreated.length,
			uniqueFilesEdited: filesEdited.length,
		},
	};
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === 'string');
}

function uniqueOrdered(values: string[]): string[] {
	return [...new Set(values)];
}
