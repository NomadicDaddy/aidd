import { appendFile, readFile } from 'node:fs/promises';

import type { Hit, RootScan } from './scan.ts';

import { describeHit } from './scan.ts';

/**
 * The one line a sweep appends to D:\infra\advisory-sweeps.md, in the format the digest directive
 * fixes (step 11e), and the rule that keeps a rerun from appending it twice.
 */

export interface SweepResult {
	control: { file: null | string; name: string };
	date: string;
	hits: { hit: Hit; root: string }[];
	packages: readonly string[];
	query: string;
	roots: RootScan[];
	toolCheck: string;
}

function describeRoot(scan: RootScan): string {
	if (!scan.readable) return `${scan.root} UNSWEPT (root not readable)`;
	const count = scan.files.length === 0 ? 'no npm surface' : `${scan.files.length} files`;
	const unswept =
		scan.unreadable.length === 0 ? '' : ` (UNSWEPT below: ${scan.unreadable.join(', ')})`;
	return `${scan.root} ${count}${unswept}`;
}

/**
 * The row text. A sweep that read nothing at all is the FAILED form, never a clean one.
 * @param result The completed sweep.
 * @returns One line, without a trailing newline.
 */
export function formatRow(result: SweepResult): string {
	const filesRead = result.roots.reduce((sum, scan) => sum + scan.files.length, 0);
	if (filesRead === 0) return `${result.date} | FAILED: 0 files scanned`;
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

/**
 * Appends the row exactly once. A row for the same date and query already in the file is the
 * record of this sweep, so a rerun prints it and writes nothing; earlier rows are never edited.
 * @param path The sweeps file.
 * @param row The row to record.
 * @returns The row now on record and whether this call wrote it.
 */
export async function appendRowOnce(
	path: string,
	row: string,
): Promise<{ existing: string; written: false } | { written: true }> {
	const prefix = row.slice(0, row.indexOf(' | roots: '));
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
}
