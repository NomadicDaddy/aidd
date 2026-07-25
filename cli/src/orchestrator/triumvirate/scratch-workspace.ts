import type { IterationMetrics } from 'aidd-shared/orchestrator/result';

import { createHash } from 'node:crypto';
import { cp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { assertInsideRoot } from './mirror-safety.ts';
import { mergeMetrics } from './stage-execution.ts';
import {
	emptyMetrics,
	mirrorExclusions,
	originalWorktreeGuardIgnoredPaths,
	type PlanningMirrorMutation,
	type PlanningMirrorSnapshot,
	type PlanningStageRunResult,
	retryPromptChangedPathLimit,
	type StageRunResult,
	type TriumvirateStageName,
	type WorktreeSnapshot,
} from './types.ts';

export { createMirrorCopyFilter } from './mirror-safety.ts';

export async function createPlanningMirrors(
	scratchRoot: string,
	sourceProjectDir: string,
	planningProjectDirs: Record<Exclude<TriumvirateStageName, 'execution'>, string>,
): Promise<void> {
	await Promise.all(
		Object.values(planningProjectDirs).map((projectDir) =>
			resetPlanningMirror(scratchRoot, sourceProjectDir, projectDir),
		),
	);
}

async function resetPlanningMirror(
	scratchRoot: string,
	sourceProjectDir: string,
	projectDir: string,
): Promise<void> {
	// Containment assertion: verify the target path resolves UNDER the scratch root
	// before performing the recursive rm. A future caller passing the live projectDir
	// (or a symlink that escapes) must never delete the target repository.
	await assertInsideRoot(scratchRoot, projectDir, 'planning mirror target');
	await rm(projectDir, { force: true, recursive: true });
	await cp(sourceProjectDir, projectDir, { dereference: false, recursive: true });
}

export async function runPlanningStageWithMirrorGuard(input: {
	makeStageRun: (prompt: string) => Promise<StageRunResult>;
	projectDir: string;
	prompt: string;
	scratchRoot: string;
	sourceProjectDir: string;
	stage: Exclude<TriumvirateStageName, 'execution'>;
}): Promise<PlanningStageRunResult> {
	const metrics: IterationMetrics = { ...emptyMetrics, errorReasons: [], toolBreakdown: {} };
	const previousMutations: PlanningMirrorMutation[] = [];
	let prompt = input.prompt;

	for (let attempt = 1; attempt <= 2; attempt++) {
		await resetPlanningMirror(input.scratchRoot, input.sourceProjectDir, input.projectDir);
		const baseline = await snapshotPlanningMirror(input.projectDir);
		const result = await input.makeStageRun(prompt);
		mergeMetrics(metrics, result.metrics);
		const mutation = await detectPlanningMirrorMutation(
			input.stage,
			baseline,
			input.projectDir,
			result,
		);
		if (!mutation) {
			if (previousMutations.length > 0) {
				result.artifact.planningMirrorRetry = {
					attempts: attempt,
					previousMutations,
					reason: 'planning_mirror_mutation',
				};
			}
			return { metrics, result };
		}

		if (attempt === 2) return { metrics, result, violation: mutation };
		previousMutations.push(mutation);
		prompt = buildPlanningRetryPrompt(input.prompt, mutation);
	}

	throw new Error(`unreachable planning retry state for ${input.stage}`);
}

async function snapshotPlanningMirror(projectDir: string): Promise<PlanningMirrorSnapshot> {
	const files = new Map<string, string>();
	await addDirectoryToPlanningSnapshot(projectDir, projectDir, files);
	return { files };
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
			const relativePath = normalizeRelativePath(relative(rootDir, fullPath));
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

async function detectPlanningMirrorMutation(
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

function changedPlanningMirrorPaths(
	before: PlanningMirrorSnapshot,
	after: PlanningMirrorSnapshot,
): string[] {
	const paths = new Set([...before.files.keys(), ...after.files.keys()]);
	return [...paths]
		.filter((path) => before.files.get(path) !== after.files.get(path))
		.sort((left, right) => left.localeCompare(right));
}

function normalizeRelativePath(path: string): string {
	return path.replaceAll('\\', '/');
}

function buildPlanningRetryPrompt(prompt: string, mutation: PlanningMirrorMutation): string {
	return `## aidd PLANNING STAGE RETRY

The previous planning attempt modified its planning mirror, which is not allowed.
Retry from a clean mirror and produce a read-only plan only.

Changed paths from the rejected attempt:
${formatChangedPathsForRetryPrompt(mutation.changedPaths)}

---

${prompt}`;
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

export function rewritePromptProjectPathForPlanningMirror(
	text: string,
	projectDir: string,
	scratchProjectDir: string,
): string {
	const replacements = [
		[projectDir, scratchProjectDir],
		[projectDir.replaceAll('\\', '/'), scratchProjectDir.replaceAll('\\', '/')],
		[projectDir.replaceAll('/', '\\'), scratchProjectDir.replaceAll('/', '\\')],
	] as const;
	let rewritten = text;
	for (const [from, to] of replacements) {
		if (!from) continue;
		rewritten = rewritten.replace(new RegExp(escapeRegExp(from), 'gi'), () => to);
	}
	return rewritten;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function snapshotWorktree(projectDir: string): Promise<WorktreeSnapshot> {
	const proc = Bun.spawn(
		['git', '-C', projectDir, 'status', '--porcelain=v1', '--untracked-files=all'],
		{
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		},
	);
	const status = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;
	if (exitCode !== 0) return { available: false, status: '' };
	return { available: true, status: normalizeOriginalWorktreeStatus(status) };
}

function normalizeOriginalWorktreeStatus(status: string): string {
	const lines = status.split(/\r?\n/).filter(Boolean);
	const relevantLines = lines.filter((line) => {
		const path = originalWorktreeStatusPath(line);
		return path === undefined || !originalWorktreeGuardIgnoredPaths.has(path);
	});
	return relevantLines.length > 0 ? `${relevantLines.join('\n')}\n` : '';
}

function originalWorktreeStatusPath(line: string): string | undefined {
	if (line.length < 4) return undefined;
	const rawPath = line.slice(3).trim();
	if (!rawPath) return undefined;
	const renamedPath = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath;
	if (!renamedPath) return undefined;
	return normalizeRelativePath(renamedPath.replace(/^"|"$/g, ''));
}

export async function assertUnchanged(
	stage: string,
	baseline: WorktreeSnapshot,
	projectDir: string,
): Promise<string | undefined> {
	if (!baseline.available) return undefined;
	const current = await snapshotWorktree(projectDir);
	if (!current.available) return `worktree guard unavailable after ${stage} planning stage`;
	if (current.status === baseline.status) return undefined;
	return `original worktree changed during ${stage} planning stage`;
}
