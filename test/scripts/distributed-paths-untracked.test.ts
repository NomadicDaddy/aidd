import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { listDistributableFiles } from '../../scripts/lib/third-party-licenses/distributed-paths.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';

// check:licenses must see a new file before it is committed. Listing tracked files only let a new,
// unclassified panel script pass a full gate run and fail on main once committed (fa764811).
function git(root: string, ...args: string[]): void {
	const result = Bun.spawnSync(['git', '-C', root, ...args], { windowsHide: true });
	if (result.exitCode !== 0)
		throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
}

describe('the distributed-file listing', () => {
	test('includes untracked files git does not ignore, and leaves out ignored ones', async () => {
		const root = await testTempDir('aidd-distributed-paths-');
		try {
			git(root, 'init', '-q');
			await mkdir(join(root, 'frontend', 'public'), { recursive: true });
			await writeFile(join(root, '.gitignore'), 'frontend/public/ignored.js\n');
			await writeFile(join(root, 'frontend', 'public', 'tracked.svg'), '<svg/>');
			git(root, 'add', '.gitignore', 'frontend/public/tracked.svg');
			await writeFile(join(root, 'frontend', 'public', 'new-script.js'), 'void 0;');
			await writeFile(join(root, 'frontend', 'public', 'ignored.js'), 'void 0;');

			expect(await listDistributableFiles(root, ['frontend/public'])).toEqual([
				'frontend/public/new-script.js',
				'frontend/public/tracked.svg',
			]);
		} finally {
			await removeTempTree(root);
		}
	});
});
