import { recordDataMovement } from '../dataMovementTrace.ts';
import { statOrNull } from '../fsHelpers.ts';

export type CommitDiffState = 'error' | 'missing-commit' | 'not-a-repo' | 'ok' | 'project-missing';

export interface CommitDiffResult {
	diff: string;
	reason: null | string;
	state: CommitDiffState;
	/** Bytes git produced before the response was capped or the command finished. */
	totalBytes: number;
	/** True when `diff` carries only the leading window of a patch larger than the cap. */
	truncated: boolean;
}

const commitShaPattern = /^[0-9a-f]{7,40}$/i;
// A single feature commit is rarely beyond a few hundred KiB of patch text; the cap exists for
// the pathological case (vendored deps, lockfile churn) where the patch would otherwise dominate
// the response. The frontend additionally bounds how many lines it renders per file.
const maxDiffBytes = 1_536 * 1024;
const diffTimeoutMs = 10_000;

function failure(state: CommitDiffState, reason: string): CommitDiffResult {
	return { diff: '', reason, state, totalBytes: 0, truncated: false };
}

function classifyGitFailure(stderr: string): CommitDiffResult {
	const text = stderr.toLowerCase();
	if (/unknown revision|bad object|bad revision|ambiguous argument/.test(text)) {
		return failure(
			'missing-commit',
			'The commit is no longer reachable in the repository (rebased or garbage-collected).',
		);
	}
	if (text.includes('not a git repository')) {
		return failure('not-a-repo', 'The project directory is not a git repository.');
	}
	const firstLine = stderr.split(/\r?\n/).find((line) => line.trim()) ?? 'git show failed';
	return failure('error', firstLine.trim());
}

// Read the patch stream up to the byte cap, then kill git rather than draining a potentially
// huge patch. Decoding cuts at the last newline so the response never ends mid-line or inside
// a multi-byte UTF-8 sequence.
async function collectCappedStdout(
	subprocess: ReturnType<typeof Bun.spawn>,
	stdout: ReadableStream<Uint8Array>,
): Promise<{ received: number; text: string; timedOut: boolean; truncated: boolean }> {
	const reader = stdout.getReader();
	const deadline = Bun.sleep(diffTimeoutMs).then(() => 'timeout' as const);
	const chunks: Uint8Array[] = [];
	let received = 0;
	let kept = 0;
	let truncated = false;
	let timedOut = false;
	try {
		for (;;) {
			const next = await Promise.race([reader.read(), deadline]);
			if (next === 'timeout') {
				timedOut = true;
				break;
			}
			if (next.done) break;
			received += next.value.byteLength;
			if (!truncated) {
				chunks.push(next.value);
				kept += next.value.byteLength;
				if (kept >= maxDiffBytes) truncated = true;
			} else {
				// Past the cap: stop git instead of draining the rest of the patch.
				break;
			}
		}
	} finally {
		reader.releaseLock();
	}
	if (truncated || timedOut) subprocess.kill();
	const buffer = Buffer.concat(chunks);
	let text = buffer.toString('utf8');
	if (truncated) {
		const lastNewline = text.lastIndexOf('\n');
		if (lastNewline !== -1) text = text.slice(0, lastNewline + 1);
	}
	return { received, text, timedOut, truncated };
}

export async function readCommitDiff(projectPath: string, sha: string): Promise<CommitDiffResult> {
	// The route schema already constrains the hash; re-check here so the service is safe to call
	// from any future caller — the value becomes a git argv entry.
	if (!commitShaPattern.test(sha)) {
		return failure('error', 'Commit hash must be 7 to 40 hex characters.');
	}
	const dirStat = await statOrNull(projectPath);
	if (!dirStat?.isDirectory()) {
		return failure('project-missing', 'The project directory does not exist on disk.');
	}

	let subprocess: ReturnType<typeof Bun.spawn>;
	try {
		// Bun.spawn (never node:child_process) — on Windows the latter leaks the HTTP listen
		// socket into the child and orphans the port. Argv array means no shell interpolation.
		subprocess = Bun.spawn(
			[
				'git',
				'-c',
				'core.quotepath=false',
				'show',
				'--no-color',
				'--stat',
				'--patch',
				'--find-renames',
				sha,
			],
			{
				cwd: projectPath,
				stderr: 'pipe',
				stdin: 'ignore',
				stdout: 'pipe',
				windowsHide: true,
			},
		);
	} catch (err) {
		return failure('error', err instanceof Error ? err.message : String(err));
	}

	const stdoutStream = subprocess.stdout instanceof ReadableStream ? subprocess.stdout : null;
	const stderrStream = subprocess.stderr instanceof ReadableStream ? subprocess.stderr : null;
	if (!stdoutStream) {
		subprocess.kill();
		return failure('error', 'git show produced no readable output stream.');
	}

	const { received, text, timedOut, truncated } = await collectCappedStdout(
		subprocess,
		stdoutStream,
	);
	if (timedOut) {
		recordDataMovement({
			category: 'file',
			operation: 'project.commit-diff.read',
			status: 'error',
			summary: { sha, timedOut: true },
			target: projectPath,
		});
		return failure('error', `git show timed out after ${diffTimeoutMs}ms.`);
	}

	const [stderr, exitCode] = await Promise.all([
		stderrStream ? new Response(stderrStream).text() : Promise.resolve(''),
		subprocess.exited,
	]);
	// A non-zero exit after we killed git at the cap is expected — the captured window is valid.
	if (exitCode !== 0 && !truncated) {
		recordDataMovement({
			category: 'file',
			operation: 'project.commit-diff.read',
			status: 'miss',
			summary: { exitCode, sha },
			target: projectPath,
		});
		return classifyGitFailure(stderr);
	}

	recordDataMovement({
		category: 'file',
		operation: 'project.commit-diff.read',
		status: 'hit',
		summary: { bytes: text.length, sha, truncated },
		target: projectPath,
	});
	return { diff: text, reason: null, state: 'ok', totalBytes: received, truncated };
}
