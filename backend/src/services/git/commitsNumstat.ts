import { statOrNull } from '../fsHelpers.ts';

export interface CommitsNumstat {
	deletions: number;
	filesChanged: number;
	insertions: number;
}

const commitShaPattern = /^[0-9a-f]{7,40}$/i;
const numstatTimeoutMs = 10_000;

async function gitNumstatOutput(projectPath: string, hash: string): Promise<null | string> {
	let subprocess: ReturnType<typeof Bun.spawn>;
	try {
		// Bun.spawn (never node:child_process) — on Windows the latter leaks the HTTP listen
		// socket into the child and orphans the port. Argv array means no shell interpolation,
		// and the try/catch absorbs a missing git binary (Bun.spawn throws ENOENT).
		subprocess = Bun.spawn(['git', 'show', '--numstat', '--format=', '--no-renames', hash], {
			cwd: projectPath,
			stderr: 'ignore',
			stdin: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
	} catch {
		return null;
	}
	const timeout = setTimeout(() => subprocess.kill(), numstatTimeoutMs);
	try {
		const stdout =
			subprocess.stdout instanceof ReadableStream
				? await new Response(subprocess.stdout).text()
				: '';
		const exitCode = await subprocess.exited;
		return exitCode === 0 ? stdout : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

// Backend counterpart of the CLI's gitCommitsDiffStat: numstat summed over a run's recorded
// commits, used by the output-metrics backfill for ledger entries that predate diffstat capture.
// Per-hash invocation so one GC'd/rebased commit degrades to a partial stat instead of losing
// the whole run. Returns null when no hash resolves (or the project/git is gone) so callers can
// leave the columns NULL rather than writing zeros.
export async function readCommitsNumstat(
	projectPath: string,
	hashes: readonly string[],
): Promise<CommitsNumstat | null> {
	const validHashes = hashes.filter((hash) => commitShaPattern.test(hash));
	if (validHashes.length === 0) return null;
	const dirStat = await statOrNull(projectPath);
	if (!dirStat?.isDirectory()) return null;
	const files = new Set<string>();
	let insertions = 0;
	let deletions = 0;
	let resolvedAny = false;
	for (const hash of validHashes) {
		const output = await gitNumstatOutput(projectPath, hash);
		if (output === null) continue;
		resolvedAny = true;
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
	return resolvedAny ? { deletions, filesChanged: files.size, insertions } : null;
}
