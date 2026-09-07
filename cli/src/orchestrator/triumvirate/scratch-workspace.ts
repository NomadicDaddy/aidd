import type { IterationMetrics } from 'aidd-shared/orchestrator/result';

import { cp, rm } from 'node:fs/promises';

import { assertInsideRoot, normalizeMirrorRelativePath } from './mirror-safety.ts';
import {
	buildPlanningRetryPrompt,
	detectPlanningMirrorMutation,
	snapshotPlanningMirror,
} from './planning-mirror-guard.ts';
import { mergeMetrics } from './stage-execution.ts';
import { buildPlanningMarkerRetryPrompt } from './stage-prompts.ts';
import {
	emptyMetrics,
	originalWorktreeGuardIgnoredPaths,
	type PlanningMirrorMutation,
	type PlanningStageRunResult,
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
	/** Returns an invalid-output reason. Marker and mirror-mutation corrections each have
	 * an independent retry budget, so a stage can consume one of each. */
	validate?: (result: StageRunResult) => string | undefined;
}): Promise<PlanningStageRunResult> {
	const metrics: IterationMetrics = { ...emptyMetrics, errorReasons: [], toolBreakdown: {} };
	const previousMutations: PlanningMirrorMutation[] = [];
	let markerRetried = false;
	let markerRetryReason: string | undefined;
	let mutationRetried = false;
	let prompt = input.prompt;

	for (let attempt = 1; attempt <= 3; attempt++) {
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
			if (markerRetried) {
				result.artifact.planningMarkerRetry = {
					attempts: attempt,
					reason: 'missing_plan_markdown',
				};
			}
			const invalidReason = input.validate?.(result);
			if (invalidReason !== undefined && !markerRetried) {
				markerRetried = true;
				markerRetryReason = invalidReason;
				prompt = buildCombinedPlanningRetryPrompt(
					input.prompt,
					previousMutations[0],
					markerRetryReason,
				);
				continue;
			}
			// A still-invalid corrected attempt returns as-is; the caller re-validates and
			// classifies (invalidPlanningOutputResult), keeping failure shaping in one place.
			return { metrics, result };
		}

		if (mutationRetried) return { metrics, result, violation: mutation };
		mutationRetried = true;
		previousMutations.push(mutation);
		prompt = buildCombinedPlanningRetryPrompt(input.prompt, mutation, markerRetryReason);
	}

	throw new Error(`unreachable planning retry state for ${input.stage}`);
}

function buildCombinedPlanningRetryPrompt(
	prompt: string,
	mutation: PlanningMirrorMutation | undefined,
	markerReason: string | undefined,
): string {
	const corrected =
		markerReason === undefined ? prompt : buildPlanningMarkerRetryPrompt(prompt, markerReason);
	return mutation === undefined ? corrected : buildPlanningRetryPrompt(corrected, mutation);
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
	return normalizeMirrorRelativePath(renamedPath.replace(/^"|"$/g, ''));
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
