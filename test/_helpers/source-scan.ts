import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared plumbing for the tests that enforce a rule by reading the source tree rather than by
 * exercising it: `test/scripts/env-key-registry.test.ts` and `test/scripts/enum-single-source.test.ts`.
 * Both need the same file walk and the same answer to "is this line code or prose", and a scanner
 * that quietly stops reaching files turns every assertion built on it into a pass.
 */

export const repoRoot = join(import.meta.dir, '..', '..');

const SKIP_DIRS = new Set(['build', 'dist', 'node_modules', 'snapshots']);

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (/\.tsx?$/.test(entry.name)) yield full;
	}
}

/** Every `.ts`/`.tsx` file under the given repo-relative roots. Absent roots are skipped. */
export function sourceFiles(roots: string[]): string[] {
	const files: string[] = [];
	for (const root of roots) {
		const abs = join(repoRoot, root);
		try {
			statSync(abs);
		} catch {
			continue;
		}
		files.push(...walk(abs));
	}
	return files;
}

/**
 * Blank out commented-out code, so a scanner does not read a disabled declaration as a live one.
 * Replaces each commented character with a space rather than deleting it, which keeps every
 * remaining offset and line number identical to the original text.
 *
 * Known limit: only whole-line comments and block comments are removed, not a comment trailing
 * live code on the same line. Widening it means parsing string and regex literals to find out
 * whether a given `//` is really a comment, and getting that wrong silently deletes real code.
 */
export function stripComments(text: string): string {
	let inBlock = false;
	return text
		.split('\n')
		.map((line) => {
			const trimmed = line.trim();
			const blanked = ' '.repeat(line.length);
			if (inBlock) {
				if (trimmed.includes('*/')) inBlock = false;
				return blanked;
			}
			if (trimmed.startsWith('/*')) {
				if (!trimmed.includes('*/')) inBlock = true;
				return blanked;
			}
			if (trimmed.startsWith('//') || trimmed.startsWith('*')) return blanked;
			return line;
		})
		.join('\n');
}
