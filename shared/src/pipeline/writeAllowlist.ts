import type { WriteGuardSnapshot, WriteViolation } from './write-allowlist/types.ts';

import { committedPathsSince, gitHead, gitStatusEntries } from './write-allowlist/git.ts';

// Shared write-allowlist guard: snapshot the worktree before a step/backend runs,
// diff after, and revert anything written outside the allowlisted relative paths.
// Git is the snapshot/diff/revert substrate. Non-git projects cannot be guarded
// this way — captureWriteGuardSnapshot returns null and the caller decides whether
// to proceed unguarded or refuse (callers that require enforcement should refuse).
//
// This module is the canonical implementation shared by the CLI orchestrator's
// --write-allowlist guard and the pipeline's metadata-only backstop.

export { revertWriteViolations } from './write-allowlist/revert.ts';
export type { WriteGuardSnapshot, WriteViolation } from './write-allowlist/types.ts';

export async function captureWriteGuardSnapshot(
	projectDir: string,
): Promise<null | WriteGuardSnapshot> {
	const entries = await gitStatusEntries(projectDir);
	if (entries === null) return null;
	return { entries, head: await gitHead(projectDir) };
}

function normalizeAllowEntry(entry: string): string {
	return entry
		.replace(/\\/g, '/')
		.replace(/^\.?\//, '')
		.replace(/\/+$/, '');
}

export function isPathAllowlisted(path: string, allowlist: string[]): boolean {
	const normalized = path.replace(/\\/g, '/');
	return allowlist.some((entry) => {
		const allow = normalizeAllowEntry(entry);
		return allow.length > 0 && (normalized === allow || normalized.startsWith(`${allow}/`));
	});
}

// Paths whose status changed since the baseline and that fall outside the allowlist.
// Pre-existing dirt belongs to the baseline, not to this iteration.
//
// Also detects destructive operations (git reset --hard, git checkout ., git clean -fdx)
// that take no path argument: these discard baseline-dirty files, making the tree
// CLEANER rather than dirtier. A baseline path that is no longer dirty (and is not
// allowlisted) is flagged as a destructivelyDiscarded violation so the caller can
// block or report the loss of uncommitted operator work.
export async function diffWriteViolations(
	projectDir: string,
	allowlist: string[],
	baseline: WriteGuardSnapshot,
): Promise<null | WriteViolation[]> {
	const current = await gitStatusEntries(projectDir);
	if (current === null) return null;
	const byPath = new Map<string, WriteViolation>();
	for (const [path, status] of current) {
		if (baseline.entries.get(path) === status) continue;
		if (isPathAllowlisted(path, allowlist)) continue;
		byPath.set(path, {
			committed: false,
			destructivelyDiscarded: false,
			path,
			untracked: !baseline.entries.has(path) && status === '??',
		});
	}
	for (const path of await committedPathsSince(projectDir, baseline.head)) {
		if (isPathAllowlisted(path, allowlist)) continue;
		// A path can be both committed and still dirty; the committed flag wins because
		// reverting it requires rewinding HEAD, which also clears any residual dirt.
		byPath.set(path, {
			committed: true,
			destructivelyDiscarded: false,
			path,
			untracked: false,
		});
	}
	// Destructive detection: a baseline-dirty path that is no longer dirty (not in the
	// current status) was discarded by something like `git reset --hard`, `git checkout .`,
	// `git restore .`, or `git clean -fdx`. These commands take no path argument so the
	// bash workspace policy never fires, and they make the tree CLEANER — so the dirty-path
	// diff above finds nothing. Flagging these paths as violations lets the caller block
	// or report the loss of uncommitted operator work outside the allowlist.
	for (const [path] of baseline.entries) {
		if (current.has(path)) continue;
		if (isPathAllowlisted(path, allowlist)) continue;
		byPath.set(path, {
			committed: false,
			destructivelyDiscarded: true,
			path,
			untracked: false,
		});
	}
	return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function formatViolationPaths(violations: WriteViolation[], limit = 8): string {
	const paths = violations.map((violation) => violation.path);
	if (paths.length <= limit) return paths.join(', ');
	return `${paths.slice(0, limit).join(', ')} … and ${paths.length - limit} more`;
}

export function buildWriteAllowlistRetryPrompt(
	prompt: string,
	allowlist: string[],
	violations: WriteViolation[],
): string {
	const lines = violations.slice(0, 25).map((violation) => `- ${violation.path}`);
	if (violations.length > 25) lines.push(`- … and ${violations.length - 25} more`);
	return [
		'## aidd WRITE ALLOWLIST RETRY',
		'',
		'Your previous attempt modified or discarded files outside the allowed paths.',
		'Those changes have been reverted. This run may ONLY create or modify files under:',
		...allowlist.map((entry) => `- ${normalizeAllowEntry(entry)}/`),
		'',
		'Paths that violated the constraint:',
		...lines,
		'',
		'Redo the work writing only inside the allowed paths. Do not use destructive git',
		'commands (git reset --hard, git checkout ., git clean) that discard uncommitted work.',
		'If an output has no legitimate home in the allowed paths, describe it in your',
		'final summary instead of writing it.',
		'',
		'---',
		'',
		prompt,
	].join('\n');
}

// Detects whether the given directory is a git repository by attempting a porcelain
// status call. Returns null (not a git repo) or true. Used by callers that need to
// decide whether write-allowlist enforcement is available before proceeding.
export async function isGitRepository(projectDir: string): Promise<boolean> {
	const entries = await gitStatusEntries(projectDir);
	return entries !== null;
}
