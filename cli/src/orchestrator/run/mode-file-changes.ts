import type { IterationDetails } from '../details.ts';
import type { RunAccumulator } from './types.ts';

interface FileChanges {
	filesCreated: string[];
	filesEdited: string[];
}

export function modeFileChangesFromArtifacts(
	artifacts: Record<string, unknown> | undefined
): FileChanges {
	return {
		filesCreated: stringArray(artifacts?.modeFilesCreated),
		filesEdited: stringArray(artifacts?.modeFilesEdited),
	};
}

export function accumulateAdditionalFileChanges(
	acc: RunAccumulator,
	fileChanges: FileChanges
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
	modeFileChanges: FileChanges
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
