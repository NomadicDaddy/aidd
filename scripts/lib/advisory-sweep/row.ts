import { appendFile, open, readFile, stat, unlink } from 'node:fs/promises';

import type { Hit, RootScan } from './scan.ts';

import { describeHit } from './scan.ts';

/**
 * The one line a sweep appends to D:\infra\advisory-sweeps.md, in the format the digest directive
 * fixes (step 11e), and the rule that keeps a rerun from appending it twice.
 */

export interface SweptRoot {
	/** Files found whose read or parse failed; they are not counted as covered. */
	failed: { failure: string; file: string }[];
	scan: RootScan;
}

export interface SweepResult {
	control: { file: null | string; name: string };
	date: string;
	hits: { hit: Hit; root: string }[];
	packages: readonly string[];
	query: string;
	roots: SweptRoot[];
	toolCheck: string;
}

/**
 * Files the sweep actually covered in a root: found, read and parsed.
 * @param root The swept root.
 * @returns The count of files that contributed to the sweep.
 */
export function filesCovered(root: SweptRoot): number {
	return root.scan.files.length - root.failed.length;
}

function describeRoot(root: SweptRoot): string {
	const { failed, scan } = root;
	if (!scan.readable) return `${scan.root} UNSWEPT (root not readable)`;
	const covered = filesCovered(root);
	let count: string;
	if (scan.files.length === 0) count = 'no npm surface';
	else if (covered === 0) count = `UNSWEPT (0 of ${scan.files.length} files readable)`;
	else count = `${covered} files`;
	const parts: string[] = [];
	if (failed.length > 0 && covered > 0)
		parts.push(
			`${failed.length} unreadable: ${failed.map((f) => `${f.file} (${f.failure})`).join(', ')}`,
		);
	if (scan.unreadable.length > 0) parts.push(`UNSWEPT below: ${scan.unreadable.join(', ')}`);
	return `${scan.root} ${count}${parts.length > 0 ? ` (${parts.join('; ')})` : ''}`;
}

/**
 * The row text. A sweep that covered nothing at all is the FAILED form, never a clean one.
 * @param result The completed sweep.
 * @returns One line, without a trailing newline.
 */
export function formatRow(result: SweepResult): string {
	const covered = result.roots.reduce((sum, root) => sum + filesCovered(root), 0);
	if (covered === 0) return `${result.date} | FAILED: 0 files scanned`;
	const packages = result.packages.length === 0 ? '(none named)' : result.packages.join(', ');
	const hits =
		result.hits.length === 0
			? 'none'
			: result.hits.map(({ hit, root }) => describeHit(hit, root)).join(', ');
	const control =
		result.control.file === null
			? `${result.control.name} NOT FOUND`
			: `${result.control.name} found in ${result.control.file}`;
	return [
		result.date,
		`advisory query: ${result.query}`,
		`roots: ${result.roots.map(describeRoot).join(' + ')}`,
		`packages checked: ${packages}`,
		`hits: ${hits}`,
		`control: ${control}`,
		`tool check: ${result.toolCheck}`,
	].join(' | ');
}

const LOCK_RETRY_MS = 50;
const LOCK_WAIT_MS = 10_000;
const LOCK_STALE_MS = 60_000;

// An exclusive create of `<path>.lock` is the mutex: whoever creates it owns the read/check/append
// below; everyone else waits. A lock older than a minute belongs to a process that died holding it.
async function withLock<T>(path: string, action: () => Promise<T>): Promise<T> {
	const lockPath = `${path}.lock`;
	const deadline = Date.now() + LOCK_WAIT_MS;
	for (;;) {
		try {
			const handle = await open(lockPath, 'wx');
			await handle.close();
			break;
		} catch (err) {
			// EEXIST is the lock held; on Windows an exclusive create can also report EPERM or EBUSY
			// while another caller is unlinking the same path. All three mean try again.
			const code = (err as { code?: string }).code;
			if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EBUSY') throw err;
			const age = await stat(lockPath)
				.then((s) => Date.now() - s.mtimeMs)
				.catch(() => 0);
			if (age > LOCK_STALE_MS) await unlink(lockPath).catch(() => undefined);
			else if (Date.now() > deadline)
				throw new Error(`${lockPath} is held; sweep not recorded`, { cause: err });
			else await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
		}
	}
	try {
		return await action();
	} finally {
		await unlink(lockPath).catch(() => undefined);
	}
}

/**
 * Appends the row exactly once. A row for the same date and query already in the file is the
 * record of this sweep, so a rerun prints it and writes nothing; earlier rows are never edited.
 * The check and the append happen under one lock, so concurrent runs cannot each append.
 * @param path The sweeps file.
 * @param row The row to record.
 * @returns The row now on record and whether this call wrote it.
 */
export async function appendRowOnce(
	path: string,
	row: string,
): Promise<{ existing: string; written: false } | { written: true }> {
	const prefix = row.slice(0, row.indexOf(' | roots: '));
	return withLock(path, async () => {
		let text = '';
		try {
			text = await readFile(path, 'utf8');
		} catch {
			// A missing file is created by the append below.
		}
		const existing = text.split(/\r?\n/).find((line) => line.startsWith(`${prefix} | `));
		if (existing !== undefined) return { existing, written: false };
		const separator = text.length === 0 || text.endsWith('\n') ? '' : '\n';
		await appendFile(path, `${separator}${row}\n`, 'utf8');
		return { written: true };
	});
}
