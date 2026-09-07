import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { repoRoot, sourceFiles, stripComments } from '../_helpers/source-scan.ts';

// On Windows a just-exited subprocess -- an agent's editor, a git child, a spawned backend --
// keeps a handle on a file under its working tree for a second or two after it dies, so a bare
// `rm(dir, { recursive: true })` in teardown throws EBUSY/ENOTEMPTY/EPERM. `removeTempTree`
// retries through that window; a bare `rm` does not.
//
// This is a guard, not a preference. The failure it prevents is uniquely hard to read: teardown
// runs after the test body has already passed, so the thrown EBUSY is reported against whichever
// test happened to be last -- a green assertion in an unrelated suite is blamed for a file lock it
// never touched, and the same suite passes when run in isolation. That misattribution has cost
// this repository a debugging session more than once, and the previous fix (adopting the helper in
// production teardown and in the suites where it had already been diagnosed) left the rest of the
// suite bare, so it recurred.
//
// Scoped to `test/` deliberately. Production removals delete real user directories rather than
// fixtures, and several of them omit `force` on purpose so that a missing path throws; those are
// judgement calls per call site, not a blanket rule.
const REMOVAL = /\brm(Sync)?\([^;\n]*recursive:\s*true/;

describe('temp tree removal', () => {
	test('the test suite tears down directories with removeTempTree, never a bare rm', () => {
		const offenders: string[] = [];
		for (const file of sourceFiles(['test'])) {
			// This file quotes the banned shape as a string literal to prove the pattern still
			// matches it, which would otherwise make the scanner report itself.
			if (file === import.meta.path) continue;
			const source = stripComments(readFileSync(file, 'utf8'));
			for (const [index, line] of source.split('\n').entries()) {
				if (REMOVAL.test(line)) {
					offenders.push(
						`${relative(repoRoot, file).replaceAll('\\', '/')}:${index + 1}`,
					);
				}
			}
		}

		expect(offenders).toEqual([]);
	});

	test('scans the files it claims to', () => {
		// A scanner that quietly stops reaching files passes vacuously. Pin both that it walks the
		// tree and that its pattern still recognises the shape it is looking for.
		expect(sourceFiles(['test']).length).toBeGreaterThan(100);
		expect(REMOVAL.test('await rm(tmpRoot, { force: true, recursive: true });')).toBe(true);
		expect(REMOVAL.test('rmSync(root, { recursive: true, force: true });')).toBe(true);
		expect(REMOVAL.test('await rm(join(dir, "one-file.txt"), { force: true });')).toBe(false);
	});
});
