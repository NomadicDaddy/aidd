import { beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { isClaim, LOCK_FILE, readLock } from '../../scripts/lib/shared-core/lock.ts';
import { runSharedCoreFrom } from '../_helpers/shared-core-run.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// The other half of shared-core-consumer.test.ts: what the delivered check says when this
// repository does NOT hold what its lock records, and what a refused write leaves behind. None of
// that can be tried on the real tree, so it is tried on a copy: every file the lock records, the
// lock, and the package file the hook variant is chosen from, in a git repository of its own under
// the test temp root, with nothing beside it.

const REPO_ROOT = join(import.meta.dir, '..', '..');
const VICTIM = 'scripts/lib/license-core/order.ts';

function git(root: string, ...args: string[]): void {
	const result = Bun.spawnSync(['git', '-C', root, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString()}`);
	}
}

/** A copy of what was delivered here, as a repository of its own whose index holds the modes. */
function deliveredCopy(): string {
	const lock = readLock(REPO_ROOT);
	if (lock === null) throw new Error('this repository has no lock to copy from');
	const root = testTempDirSync('shared-core-consumer-copy-');
	const executable: string[] = [];
	for (const path of [LOCK_FILE, 'package.json']) cpSync(join(REPO_ROOT, path), join(root, path));
	for (const files of Object.values(lock.groups)) {
		for (const [path, entry] of Object.entries(files ?? {})) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			cpSync(join(REPO_ROOT, path), join(root, path));
			if (!isClaim(entry) && entry.mode === '100755') executable.push(path);
		}
	}
	git(root, 'init', '-q');
	git(root, 'add', '-A');
	// The lock records the mode git holds, and a copy made on Windows carries no executable bit.
	for (const path of executable) git(root, 'update-index', '--chmod=+x', path);
	return root;
}

/** A hash of every file under `root` outside `.git`, by relative path. */
function snapshot(root: string): Record<string, string> {
	const hashes: Record<string, string> = {};
	const walk = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== '.git') walk(path);
				continue;
			}
			hashes[relative(root, path)] = createHash('sha256')
				.update(readFileSync(path))
				.digest('hex');
		}
	};
	walk(root);
	return hashes;
}

describe('the delivered sync, run in a copy of what was delivered here', () => {
	let copy = '';
	beforeAll(() => {
		copy = deliveredCopy();
	});

	test('the untouched copy passes, so each failure below is the change made to it', () => {
		const { code, out } = runSharedCoreFrom(copy, '--check');
		expect(out).toMatch(/\[OK\] Shared core: \d+ file\(s\) in \d+ group\(s\) match/u);
		// Nothing is beside the copy to verify the lock's origin against, and it says so.
		expect(out).toContain('Origin not verified');
		expect(code).toBe(0);
	});

	test('a refused write changes no byte: not a delivered file, not the lock', () => {
		const before = snapshot(copy);
		expect(Object.keys(before).length).toBeGreaterThan(10);
		const { code } = runSharedCoreFrom(copy, '--write');
		expect(code).toBe(2);
		expect(snapshot(copy)).toEqual(before);
	});

	test('one delivered file altered fails the check, and the failure names that file', () => {
		const altered = deliveredCopy();
		appendFileSync(join(altered, VICTIM), '\n// one line this repository added\n');
		const { code, out } = runSharedCoreFrom(altered, '--check');
		expect(out).toContain(`- ${VICTIM}:0 differs from the hash recorded for it`);
		expect(out).not.toContain('[OK]');
		expect(code).toBe(1);
		// And only that file: the rest of the delivery is still what the lock records.
		expect(out.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(1);
	});
});
