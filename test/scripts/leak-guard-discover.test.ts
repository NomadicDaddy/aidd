import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { discoverRepos } from '../../scripts/lib/leak-guard/git.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function gitInit(dir: string): Promise<void> {
	const proc = Bun.spawn(['git', 'init', '-q', dir], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) throw new Error('git init failed');
}

function captured(run: () => string[]): { errors: string[]; logs: string[]; repos: string[] } {
	const logs: string[] = [];
	const errors: string[] = [];
	const log = console.log;
	const error = console.error;
	console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
	console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));
	try {
		return { errors, logs, repos: run() };
	} finally {
		console.log = log;
		console.error = error;
	}
}

describe('leak-guard repository discovery', () => {
	test('a declined repository named in --only is DECLINED, not UNKNOWN', async () => {
		const fleet = await testTempDir('aidd-leak-discover-');
		try {
			const declining = join(fleet, 'records');
			await mkdir(declining);
			await gitInit(declining);
			await writeFile(
				join(declining, '.no-fleet-sync'),
				'# why\nauthored text only; no remote\n',
			);

			const { errors, logs, repos } = captured(() =>
				discoverRepos(fleet, new Set(['missing', 'records'])),
			);

			expect(repos).toEqual([]);
			expect(logs.join('\n')).toContain('DECLINED records: authored text only; no remote');
			// Only the name that matched nothing is unknown.
			expect(errors).toEqual([`  UNKNOWN missing: no git repository under ${fleet}`]);
		} finally {
			await removeTempTree(fleet);
		}
	});
});
