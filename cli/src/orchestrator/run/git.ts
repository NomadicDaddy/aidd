import type { PromptInput } from 'aidd-shared/backends/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { runRepoDir } from 'aidd-shared/plan/types';
import { setTimeout as sleep } from 'node:timers/promises';

import type { CommitDiffStat, GitCommitSummary, RunAccumulator } from './types.ts';

import { gitOutput, readGitHead } from './git-exec.ts';

// Re-exported so callers continue importing the full git helper surface from './git.ts'.
export { readGitHead } from './git-exec.ts';

type WaitForCommitOutcome = { committed: boolean; headAfter: string | undefined };

export async function waitForCommitOrTimeout(
	projectDir: string,
	gitHeadBefore: string | undefined,
	timeoutMs: number,
	pollIntervalMs = 1000,
): Promise<WaitForCommitOutcome> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const head = await readGitHead(projectDir);
		if (head !== undefined && head !== gitHeadBefore) {
			return { committed: true, headAfter: head };
		}
		const remaining = deadline - Date.now();
		if (remaining <= 0) break;
		await sleep(Math.min(pollIntervalMs, remaining));
	}
	const head = await readGitHead(projectDir);
	return { committed: head !== undefined && head !== gitHeadBefore, headAfter: head };
}

export async function listGitCommits(
	projectDir: string,
	before: string | undefined,
	after: string | undefined,
	notBeforeMs?: number,
): Promise<GitCommitSummary[]> {
	if (after === undefined || before === after) return [];
	// `before === undefined` means the project HEAD did not resolve at iteration start — a fresh
	// `git init` with no initial commit, which is the initializer phase's starting point. Every
	// commit now reachable from `after` was created during this run, so attribute the whole
	// history from the root instead of returning []. Using the bare `after` ref (rather than a
	// `before..after` range) walks back to the first commit.
	const range = before === undefined ? after : `${before}..${after}`;
	const output = await gitOutput(projectDir, [
		'log',
		'--reverse',
		'--format=%H%x09%ct%x09%s',
		range,
	]);
	if (!output) return [];
	return output
		.split(/\r?\n/)
		.map((line): GitCommitSummary | undefined => {
			const [hash, committedAtSeconds, ...subjectParts] = line.split('\t');
			if (!hash || committedAtSeconds === undefined || subjectParts.length === 0)
				return undefined;
			const committedAtMs = Number.parseInt(committedAtSeconds, 10) * 1000;
			// Git timestamps have one-second precision. Keep commits from the iteration's start second,
			// but reject older commits exposed by a stale/racing HEAD baseline.
			if (notBeforeMs !== undefined && committedAtMs + 1000 < notBeforeMs) return undefined;
			return { hash, subject: subjectParts.join('\t') };
		})
		.filter((entry): entry is GitCommitSummary => entry !== undefined);
}

export type { CommitDiffStat };

// Ground-truth file-change counts for a run's commits, derived from git rather than from
// Write/Edit tool-call counts. Runs that mutate files through bash (git mv/rm, scripted
// rewrites, prettier) leave filesEdited/filesCreated at ~0, which made the AI run summary
// describe sweeping commits as trivial. Distinct paths are unioned across commits so a file
// touched by two commits counts once; insertions/deletions sum the per-commit numstat.
export async function gitCommitsDiffStat(
	projectDir: string,
	hashes: readonly string[],
): Promise<CommitDiffStat> {
	const files = new Set<string>();
	let insertions = 0;
	let deletions = 0;
	for (const hash of hashes) {
		const output = await gitOutput(projectDir, [
			'show',
			'--numstat',
			'--format=',
			'--no-renames',
			hash,
		]);
		if (!output) continue;
		for (const rawLine of output.split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line) continue;
			const [added, removed, ...pathParts] = line.split('\t');
			const path = pathParts.join('\t');
			if (!path || added === undefined || removed === undefined) continue;
			files.add(path);
			// Binary files render '-' for added/removed; skip those rather than count NaN.
			if (added !== '-') insertions += Number.parseInt(added, 10) || 0;
			if (removed !== '-') deletions += Number.parseInt(removed, 10) || 0;
		}
	}
	return { deletions, filesChanged: files.size, insertions };
}

const FEATURE_PATH_PREFIX = '.aidd/features/';

async function commitFeatureDirectories(projectDir: string, hash: string): Promise<string[]> {
	const output = await gitOutput(projectDir, [
		'diff-tree',
		'--no-commit-id',
		'--name-only',
		'-r',
		hash,
	]);
	if (!output) return [];
	const dirs = new Set<string>();
	for (const rawLine of output.split(/\r?\n/)) {
		const line = rawLine.trim().replace(/^"|"$/g, '');
		if (!line.startsWith(FEATURE_PATH_PREFIX)) continue;
		const dir = line.slice(FEATURE_PATH_PREFIX.length).split('/')[0];
		if (dir) dirs.add(dir);
	}
	return [...dirs];
}

// A later run's iteration can commit uncommitted work left behind by an earlier
// orphaned/recovery iteration (its run ledger row was never written). Those commits fall
// inside this run's gitHeadBefore..gitHeadAfter window and would otherwise be claimed here.
// Only attribute a feature-touching commit when at least one of its feature directories is
// in this run's selected/completed set; commits touching no feature directory (infra,
// chores) are always kept as genuine run work.
export async function filterRunAttributedCommits(
	projectDir: string,
	commits: GitCommitSummary[],
	attributedFeatures: ReadonlySet<string>,
	forcedCommitHashes: ReadonlySet<string>,
): Promise<GitCommitSummary[]> {
	const kept: GitCommitSummary[] = [];
	for (const commit of commits) {
		// Phase scaffold commits are recorded as genuine run work and bypass the orphan guard
		// even though they touch feature directories outside the (empty) attributed set.
		if (forcedCommitHashes.has(commit.hash)) {
			kept.push(commit);
			continue;
		}
		const featureDirs = await commitFeatureDirectories(projectDir, commit.hash);
		if (featureDirs.length === 0 || featureDirs.some((dir) => attributedFeatures.has(dir))) {
			kept.push(commit);
		}
	}
	return kept;
}

export async function gitWorktreeClean(
	projectDir: string,
	options: { excludeAiddMetadata?: boolean } = {},
): Promise<boolean> {
	const status = await gitOutput(projectDir, [
		'status',
		'--porcelain=v1',
		'--untracked-files=all',
		'--',
		'.',
	]);
	if (status === undefined) return false;
	const lines = status.split(/\r?\n/).filter((line) => line.trim() !== '');
	if (!options.excludeAiddMetadata) return lines.length === 0;
	return lines.every((line) => {
		const path = porcelainEntryPath(line);
		return path !== undefined && isAiddMetadataPath(path);
	});
}

// A porcelain=v1 status line is "XY <path>" (renames/copies: "XY <orig> -> <dest>").
// Return the tracked/destination path with forward slashes and surrounding quotes stripped,
// or undefined when the line is too short to carry a path.
function porcelainEntryPath(line: string): string | undefined {
	const trimmed = line.trimEnd();
	if (trimmed.length <= 3) return undefined;
	let pathField = trimmed.slice(3);
	const arrowIndex = pathField.indexOf(' -> ');
	if (arrowIndex !== -1) pathField = pathField.slice(arrowIndex + 4);
	return pathField.replaceAll('\\', '/').replace(/^"|"$/g, '');
}

// aidd owns everything under .aidd/ and installs it through a separate write-allowlist. Its
// own metadata writes (_common, iterations, runs.jsonl, features) must not count toward the
// coding-mode dirty-tree gate: on an ingested project whose .gitignore lacks aidd runtime
// entries, intake's own writes would otherwise trip the very audit steps intake runs next
// (a fresh aidd project hides these via its scaffolded .gitignore). Application-code dirt
// still counts.
export function isAiddMetadataPath(path: string): boolean {
	return path === '.aidd' || path.startsWith('.aidd/');
}

export async function gitDirtyFileCount(
	projectDir: string,
	options: { excludeAiddMetadata?: boolean } = {},
): Promise<number> {
	const status = await gitOutput(projectDir, [
		'status',
		'--porcelain=v1',
		'--untracked-files=all',
		'--',
		'.',
	]);
	if (status === undefined) return 0;
	const lines = status.split(/\r?\n/).filter((line) => line.trim() !== '');
	if (!options.excludeAiddMetadata) return lines.length;
	return lines.filter((line) => {
		const path = porcelainEntryPath(line);
		return path === undefined || !isAiddMetadataPath(path);
	}).length;
}

/** Capture the run-start baseline for writeRunSummary's run-end dirty-source check: any
 * non-.aidd path already dirty here is operator state the run must neither flag nor commit.
 * When git status fails (not a repository) the baseline stays unset and the check is skipped
 * rather than misattributing all existing dirt to the run. */
export async function captureDirtySourceBaseline(
	acc: RunAccumulator,
	projectDir: string,
): Promise<void> {
	const baseline = await gitDirtySourcePaths(projectDir);
	if (baseline !== undefined) acc.dirtySourcePathsAtStart = new Set(baseline);
}

// Paths of dirty files (modified, staged, or untracked), with forward slashes; aidd-owned
// .aidd/ metadata is excluded unless includeAiddMetadata is set (completion recovery stages
// tracked metadata alongside the work it belongs to). Gitignored paths never appear in
// porcelain output, so they cannot trip dirty-source accounting. Returns undefined when git
// status fails (not a repository), letting callers distinguish "clean" from "unknown" instead
// of treating a failure as an empty tree.
export async function gitDirtySourcePaths(
	projectDir: string,
	options: { includeAiddMetadata?: boolean } = {},
): Promise<string[] | undefined> {
	const status = await gitOutput(projectDir, [
		'status',
		'--porcelain=v1',
		'--untracked-files=all',
		'--',
		'.',
	]);
	if (status === undefined) return undefined;
	const paths: string[] = [];
	for (const line of status.split(/\r?\n/)) {
		if (line.trim() === '') continue;
		const path = porcelainEntryPath(line);
		if (path === undefined) continue;
		if (!options.includeAiddMetadata && isAiddMetadataPath(path)) continue;
		paths.push(path);
	}
	return paths;
}

export async function gitUntrackedFeatureDirectories(projectDir: string): Promise<string[]> {
	const status = await gitOutput(projectDir, [
		'status',
		'--porcelain=v1',
		'--untracked-files=all',
		'--',
		'.aidd/features',
	]);
	if (status === undefined) return [];
	const dirs = new Set<string>();
	for (const rawLine of status.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (!line.startsWith('?? ')) continue;
		const path = line.slice(3).replaceAll('\\', '/').replace(/^"|"$/g, '');
		if (!path.startsWith(FEATURE_PATH_PREFIX)) continue;
		const parts = path.slice(FEATURE_PATH_PREFIX.length).split('/');
		if (parts.length < 2) continue;
		const dir = parts[0];
		if (dir) dirs.add(dir);
	}
	return [...dirs].sort((left, right) => left.localeCompare(right));
}

export function buildPromptInput(plan: RunPlan, text: string): PromptInput {
	const input: PromptInput = {
		cwd: runRepoDir(plan),
		reasoningEffort: plan.reasoningEffort,
		simulation: plan.simulation,
		text,
	};
	if (plan.model !== undefined) input.model = plan.model;
	if (plan.thinking !== undefined) input.thinking = plan.thinking;
	if (plan.thinkingLevel !== undefined) input.thinkingLevel = plan.thinkingLevel;
	return input;
}
