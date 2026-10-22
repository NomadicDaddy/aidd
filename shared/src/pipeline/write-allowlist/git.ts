import { statSync } from 'node:fs';
import { join } from 'node:path';

async function readProcessText(stream: ReadableStream<Uint8Array>): Promise<string> {
	return new Response(stream).text();
}

export async function gitCapture(projectDir: string, args: string[]): Promise<null | string> {
	try {
		const proc = Bun.spawn(['git', ...args], {
			cwd: projectDir,
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, code] = await Promise.all([readProcessText(proc.stdout), proc.exited]);
		return code === 0 ? stdout : null;
	} catch {
		return null;
	}
}

export async function gitHead(projectDir: string): Promise<string | undefined> {
	const out = await gitCapture(projectDir, ['rev-parse', '--verify', 'HEAD']);
	return out?.trim() || undefined;
}

// Whether `tree` (a commit sha, or any tree-ish) contains `path`. `cat-file -e` prints nothing and
// answers with its exit code, so a successful call yields the empty string — check against null,
// never for truthiness.
export async function pathExistsInTree(
	projectDir: string,
	tree: string,
	path: string,
): Promise<boolean> {
	return (await gitCapture(projectDir, ['cat-file', '-e', `${tree}:${path}`])) !== null;
}

// The blob id git would store for each path that is a regular file on disk now, keyed by path.
// A path that is missing or not a file is left out, so "absent" compares equal to "absent".
// A file that exists but could not be hashed maps to null, never to "absent": treating an
// unreadable file as absent let a deleted file compare equal to a failed baseline hash and hid the
// loss (Roger and Morticia on 1c433ff3). A caller must treat null on either side as a change.
export async function worktreeBlobs(
	projectDir: string,
	paths: Iterable<string>,
): Promise<Map<string, null | string>> {
	const files = [...paths].filter(
		(path) => statSync(join(projectDir, path), { throwIfNoEntry: false })?.isFile() === true,
	);
	const blobs = new Map<string, null | string>(files.map((path) => [path, null]));
	// --stdin-paths reads one path per line, so a name with a newline in it cannot be asked for.
	const hashable = files.filter((path) => !path.includes('\n'));
	const ids = await hashObjects(projectDir, hashable);
	hashable.forEach((path, index) => {
		const id = ids?.[index]?.trim();
		if (id) blobs.set(path, id);
	});
	return blobs;
}

async function hashObjects(projectDir: string, files: string[]): Promise<null | string[]> {
	if (files.length === 0) return [];
	try {
		const proc = Bun.spawn(['git', 'hash-object', '--stdin-paths'], {
			cwd: projectDir,
			stderr: 'pipe',
			stdin: new TextEncoder().encode(`${files.join('\n')}\n`),
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, code] = await Promise.all([readProcessText(proc.stdout), proc.exited]);
		return code === 0 ? stdout.split('\n') : null;
	} catch {
		return null;
	}
}

export async function gitStatusEntries(projectDir: string): Promise<Map<string, string> | null> {
	try {
		// `--no-renames` reports a move as a deletion and an addition. With rename detection on,
		// `R  a -> b` named only `b`, so the path the run removed was in no list: a tracked file
		// moved into `.aidd` passed the boundary, and a reverted move left the original deleted
		// while the summary said it was reverted.
		// `-z` with quotePath off: git otherwise prints a non-ASCII or special-character path
		// quoted and octal-escaped, a string that matches nothing on disk and fails every prefix
		// test, so a committed `.aidd/é.md` read as a violation and an untracked one could not be
		// reverted. NUL-terminated records carry the path as it is.
		const proc = Bun.spawn(
			[
				'git',
				'-c',
				'core.quotePath=false',
				'status',
				'--porcelain=v1',
				'-z',
				'--untracked-files=all',
				'--no-renames',
			],
			{ cwd: projectDir, stderr: 'pipe', stdout: 'pipe', windowsHide: true },
		);
		const [stdout, code] = await Promise.all([readProcessText(proc.stdout), proc.exited]);
		if (code !== 0) return null;
		const entries = new Map<string, string>();
		for (const record of stdout.split('\0')) {
			if (record.length < 4) continue;
			const status = record.slice(0, 2);
			const path = record.slice(3);
			if (path.length > 0) entries.set(path, status);
		}
		return entries;
	} catch {
		return null;
	}
}

export async function committedPathsSince(
	projectDir: string,
	baselineHead: string | undefined,
): Promise<string[]> {
	const currentHead = await gitHead(projectDir);
	if (currentHead === undefined || currentHead === baselineHead) return [];
	const range = baselineHead
		? `${baselineHead}..${currentHead}`
		: '4b825dc642cb6eb9a060e54bf8d69288fbee4904..HEAD';
	const out = await gitCapture(projectDir, [
		'-c',
		'core.quotePath=false',
		'diff',
		'--name-only',
		'-z',
		range,
	]);
	if (out === null) return [];
	return out.split('\0').filter((line) => line.length > 0);
}
