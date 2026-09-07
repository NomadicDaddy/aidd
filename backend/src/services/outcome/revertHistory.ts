import { statOrNull } from '../fsHelpers.ts';

/** How long after its commit an attributed change may be reverted and still count against the run. */
export const REVERT_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;
/** One day of slack on the history read, so a revert at the window edge is never missed. */
export const REVERT_HISTORY_SLACK_MS = 24 * 60 * 60 * 1_000;

const gitTimeoutMs = 30_000;
const revertFooter = 'This reverts commit';
const revertedCommitPattern = /This reverts commit ([0-9a-f]{7,40})\./giu;
const logChunkSize = 200;

/** A commit named by its full hash and its committer date in epoch milliseconds. */
export interface GitCommitRef {
	at: number;
	hash: string;
}

export interface RevertCommit extends GitCommitRef {
	/** Every hash the revert footer names, lowercased, as written. */
	targets: string[];
}

export type RevertHistorySkipReason =
	'git-failed' | 'git-unavailable' | 'missing-directory' | 'not-a-repository';

export interface RevertHistory {
	kind: 'history';
	/** Resolves attributed references to full commits; references absent from history are omitted. */
	resolve(references: readonly string[]): Promise<Map<string, GitCommitRef>>;
	/** Standard revert commits whose committer date falls inside the read window. */
	reverts: RevertCommit[];
}

export interface RevertHistorySkip {
	kind: 'skipped';
	reason: RevertHistorySkipReason;
}

interface GitOutput {
	exitCode: number;
	stdout: string;
}

async function runGit(
	projectPath: string,
	args: string[],
	stdin?: string,
): Promise<'spawn-failed' | GitOutput> {
	let subprocess: ReturnType<typeof Bun.spawn>;
	try {
		subprocess = Bun.spawn(['git', ...args], {
			cwd: projectPath,
			stderr: 'ignore',
			stdin: stdin === undefined ? 'ignore' : new Blob([stdin]),
			stdout: 'pipe',
			windowsHide: true,
		});
	} catch {
		return 'spawn-failed';
	}
	const timeout = setTimeout(() => subprocess.kill(), gitTimeoutMs);
	try {
		const stdout =
			subprocess.stdout instanceof ReadableStream
				? await new Response(subprocess.stdout).text()
				: '';
		return { exitCode: await subprocess.exited, stdout };
	} catch {
		return { exitCode: -1, stdout: '' };
	} finally {
		clearTimeout(timeout);
	}
}

function parseCommitLines(output: string): GitCommitRef[] {
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.flatMap((line) => {
			const [hash, seconds] = line.split('\x1f');
			const at = Number(seconds) * 1_000;
			return hash && Number.isFinite(at) ? [{ at, hash: hash.toLowerCase() }] : [];
		});
}

function parseRevertCommits(output: string): RevertCommit[] {
	return output
		.split('\x1e')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.flatMap((entry) => {
			const [hash, seconds, ...bodyParts] = entry.split('\x1f');
			const at = Number(seconds) * 1_000;
			if (!hash || !Number.isFinite(at)) return [];
			const targets = [...bodyParts.join('\x1f').matchAll(revertedCommitPattern)].flatMap(
				(match) => (match[1] ? [match[1].toLowerCase()] : []),
			);
			return targets.length > 0 ? [{ at, hash: hash.toLowerCase(), targets }] : [];
		});
}

async function resolveReferences(
	projectPath: string,
	references: readonly string[],
): Promise<Map<string, GitCommitRef>> {
	const resolved = new Map<string, GitCommitRef>();
	const wanted = [...new Set(references.map((reference) => reference.toLowerCase()))].filter(
		(reference) => /^[0-9a-f]{7,40}$/u.test(reference),
	);
	if (wanted.length === 0) return resolved;
	// cat-file resolves abbreviated hashes and reports missing or ambiguous ones by name, so a
	// reference absent from history never aborts the whole batch the way `git show` would.
	const check = await runGit(
		projectPath,
		['cat-file', '--batch-check'],
		`${wanted.join('\n')}\n`,
	);
	if (check === 'spawn-failed' || check.exitCode !== 0) return resolved;
	const fullByReference = new Map<string, string>();
	for (const line of check.stdout.split('\n')) {
		const [name, type] = line.trim().split(' ');
		if (!name || type !== 'commit') continue;
		const full = name.toLowerCase();
		for (const reference of wanted) {
			if (full.startsWith(reference)) fullByReference.set(reference, full);
		}
	}
	const fullHashes = [...new Set(fullByReference.values())];
	const dates = new Map<string, number>();
	for (let index = 0; index < fullHashes.length; index += logChunkSize) {
		const chunk = fullHashes.slice(index, index + logChunkSize);
		const log = await runGit(projectPath, [
			'log',
			'--no-walk=unsorted',
			'--format=%H%x1f%ct',
			'--no-show-signature',
			...chunk,
		]);
		if (log === 'spawn-failed' || log.exitCode !== 0) continue;
		for (const commit of parseCommitLines(log.stdout)) dates.set(commit.hash, commit.at);
	}
	for (const [reference, hash] of fullByReference) {
		const at = dates.get(hash);
		if (at !== undefined) resolved.set(reference, { at, hash });
	}
	return resolved;
}

/**
 * Opens the revert history of one project: the standard revert commits committed since `sinceMs`,
 * read with `git log --since` and `--grep` so a large repository is never walked in full, plus a
 * resolver for the run-attributed hashes. Dates are committer dates throughout.
 * @param projectPath
 * @param sinceMs
 * @returns The history, or the reason the project was skipped.
 */
export async function openRevertHistory(
	projectPath: string,
	sinceMs: number,
): Promise<RevertHistory | RevertHistorySkip> {
	if (!(await statOrNull(projectPath))?.isDirectory()) {
		return { kind: 'skipped', reason: 'missing-directory' };
	}
	const probe = await runGit(projectPath, ['rev-parse', '--git-dir']);
	if (probe === 'spawn-failed') return { kind: 'skipped', reason: 'git-unavailable' };
	if (probe.exitCode !== 0) return { kind: 'skipped', reason: 'not-a-repository' };
	const log = await runGit(projectPath, [
		'log',
		'--all',
		`--since=${new Date(sinceMs).toISOString()}`,
		`--grep=${revertFooter}`,
		'--format=%H%x1f%ct%x1f%B%x1e',
		'--no-show-signature',
	]);
	if (log === 'spawn-failed') return { kind: 'skipped', reason: 'git-unavailable' };
	if (log.exitCode !== 0) return { kind: 'skipped', reason: 'git-failed' };
	return {
		kind: 'history',
		resolve: (references) => resolveReferences(projectPath, references),
		reverts: parseRevertCommits(log.stdout),
	};
}

/**
 * Counts the attributed commits that a standard revert undid within the window, measured on
 * committer dates: a revert 13 days after its original counts, one 15 days after does not.
 * @param attributed
 * @param reverts
 * @param windowMs
 * @returns The number of distinct attributed commits reverted inside the window.
 */
export function countRevertedCommits(
	attributed: readonly GitCommitRef[],
	reverts: readonly RevertCommit[],
	windowMs = REVERT_WINDOW_MS,
): number {
	const originals = new Map(attributed.map((commit) => [commit.hash, commit]));
	let count = 0;
	for (const original of originals.values()) {
		const reverted = reverts.some(
			(revert) =>
				revert.targets.some(
					(target) =>
						original.hash.startsWith(target) || target.startsWith(original.hash),
				) &&
				revert.at >= original.at &&
				revert.at - original.at <= windowMs,
		);
		if (reverted) count += 1;
	}
	return count;
}
