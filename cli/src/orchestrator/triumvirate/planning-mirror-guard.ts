import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { normalizeMirrorRelativePath } from './mirror-safety.ts';
import {
	mirrorExclusions,
	type PlanningMirrorMutation,
	type PlanningMirrorSnapshot,
	retryPromptChangedPathLimit,
	type StageRunResult,
	type TriumvirateStageName,
} from './types.ts';

export async function snapshotPlanningMirror(projectDir: string): Promise<PlanningMirrorSnapshot> {
	const files = new Map<string, string>();
	await addDirectoryToPlanningSnapshot(projectDir, projectDir, files);
	return { files };
}

export async function detectPlanningMirrorMutation(
	stage: Exclude<TriumvirateStageName, 'execution'>,
	baseline: PlanningMirrorSnapshot,
	projectDir: string,
	result: StageRunResult,
): Promise<PlanningMirrorMutation | undefined> {
	const current = await snapshotPlanningMirror(projectDir);
	const changedPaths = changedPlanningMirrorPaths(baseline, current);
	if (changedPaths.length === 0) return undefined;
	const mutation: PlanningMirrorMutation = {
		changedPaths,
		filesModifiedCount: changedPaths.length,
		role: stage,
		stage,
		structuredResultEmitted: result.result.structuredResult !== undefined,
	};
	result.artifact.planningMirrorMutation = mutation;
	return mutation;
}

export function buildPlanningRetryPrompt(prompt: string, mutation: PlanningMirrorMutation): string {
	return `## aidd PLANNING STAGE RETRY

The previous planning attempt modified its planning mirror, which is not allowed.
Retry from a clean mirror and produce a read-only plan only.

Changed paths from the rejected attempt:
${formatChangedPathsForRetryPrompt(mutation.changedPaths)}

---

${prompt}`;
}

async function addDirectoryToPlanningSnapshot(
	rootDir: string,
	currentDir: string,
	files: Map<string, string>,
): Promise<void> {
	const entries = await readdir(currentDir, { withFileTypes: true });
	await Promise.all(
		entries.map(async (entry) => {
			const fullPath = join(currentDir, entry.name);
			if (entry.isDirectory()) {
				if (mirrorExclusions.has(entry.name)) return;
				await addDirectoryToPlanningSnapshot(rootDir, fullPath, files);
				return;
			}
			if (!entry.isFile()) return;
			const relativePath = normalizeMirrorRelativePath(relative(rootDir, fullPath));
			const content = await readFile(fullPath);
			const details = await stat(fullPath);
			const digest = createHash('sha256')
				.update(content)
				.update(String(details.mode))
				.digest('hex');
			files.set(relativePath, digest);
		}),
	);
}

function changedPlanningMirrorPaths(
	before: PlanningMirrorSnapshot,
	after: PlanningMirrorSnapshot,
): string[] {
	const paths = new Set([...before.files.keys(), ...after.files.keys()]);
	return [...paths]
		.filter((path) => before.files.get(path) !== after.files.get(path))
		.sort((left, right) => left.localeCompare(right));
}

function formatChangedPathsForRetryPrompt(changedPaths: string[]): string {
	const visiblePaths = changedPaths.slice(0, retryPromptChangedPathLimit);
	const lines = visiblePaths.map((path) => `- ${path}`);
	const omittedCount = changedPaths.length - visiblePaths.length;
	if (omittedCount <= 0) return lines.join('\n');

	lines.push(`- ... ${omittedCount} more path(s) omitted from prompt`);
	lines.push('');
	lines.push('Omitted changed-path groups:');
	for (const [group, count] of summarizeOmittedChangedPathGroups(
		changedPaths.slice(retryPromptChangedPathLimit),
	)) {
		lines.push(`- ${group}: ${count}`);
	}
	return lines.join('\n');
}

function summarizeOmittedChangedPathGroups(changedPaths: string[]): [string, number][] {
	const counts = new Map<string, number>();
	for (const path of changedPaths) {
		const group = path.split('/')[0] || '(root)';
		counts.set(group, (counts.get(group) ?? 0) + 1);
	}
	return [...counts.entries()].sort((left, right) => {
		const countOrder = right[1] - left[1];
		if (countOrder !== 0) return countOrder;
		return left[0].localeCompare(right[0]);
	});
}
