import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
	captureWorktreeSnapshot,
	findMetadataViolations,
} from '../../backend/src/services/pipeline/metadataOnlyGuard';

import { testTempDir } from '../_helpers/temp.ts';
async function git(cwd: string, ...args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', ...args], {
		cwd,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const code = await proc.exited;
	if (code !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
	}
}

describe('metadata-only pipeline guard', () => {
	test('returns null for directories that are not git repositories', async () => {
		const dir = await testTempDir('aidd-meta-guard-nogit-');
		expect(await captureWorktreeSnapshot(dir)).toBeNull();
	});

	test('flags new dirt outside .aidd/ and ignores allowlisted or pre-existing dirt', async () => {
		const dir = await testTempDir('aidd-meta-guard-git-');
		await git(dir, 'init');
		// Pre-existing dirt belongs to the baseline, not the step under guard.
		await Bun.write(join(dir, 'pre-existing.txt'), 'before');
		const before = await captureWorktreeSnapshot(dir);
		expect(before).not.toBeNull();
		if (!before) throw new Error('Expected git snapshot');

		await mkdir(join(dir, '.aidd'), { recursive: true });
		await Bun.write(join(dir, '.aidd', 'spec.md'), 'allowed write');
		await Bun.write(join(dir, 'src.ts'), 'violating write');
		const after = await captureWorktreeSnapshot(dir);
		expect(after).not.toBeNull();
		if (!after) throw new Error('Expected git snapshot');

		expect(findMetadataViolations(before, after)).toEqual(['src.ts']);
	});

	test('reports no violations when only .aidd/ changed', async () => {
		const dir = await testTempDir('aidd-meta-guard-clean-');
		await git(dir, 'init');
		const before = await captureWorktreeSnapshot(dir);
		if (!before) throw new Error('Expected git snapshot');
		await mkdir(join(dir, '.aidd', 'reports'), { recursive: true });
		await Bun.write(join(dir, '.aidd', 'reports', 'intake.md'), 'report');
		const after = await captureWorktreeSnapshot(dir);
		if (!after) throw new Error('Expected git snapshot');
		expect(findMetadataViolations(before, after)).toEqual([]);
	});
});
