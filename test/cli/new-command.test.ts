import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { degitClone } from 'aidd-shared/git/degit';

import { runNewCommand } from '../../cli/src/commands/new.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
let workDir: string;

beforeEach(async () => {
	workDir = await testTempDir('aidd-new-cmd-');
});

afterEach(async () => {
	await removeTempTree(workDir);
});

function recordingClone(code = 0): {
	calls: Parameters<typeof degitClone>[0][];
	clone: typeof degitClone;
} {
	const calls: Parameters<typeof degitClone>[0][] = [];
	const clone: typeof degitClone = async (opts) => {
		calls.push(opts);
		await mkdir(opts.targetPath, { recursive: true });
		await writeFile(join(opts.targetPath, 'partial.txt'), 'x', 'utf8');
		return { code, stderr: code === 0 ? '' : 'fatal: repository not found', stdout: '' };
	};
	return { calls, clone };
}

describe('aidd new', () => {
	test('clones with the name defaulted from the repo and exits 0', async () => {
		const { calls, clone } = recordingClone();

		const code = await runNewCommand(
			['https://github.com/Gothsec/Astro-portfolio#main', '--root', workDir],
			{ clone },
		);

		expect(code).toBe(0);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.cloneUrl).toBe('https://github.com/Gothsec/Astro-portfolio.git');
		expect(calls[0]?.ref).toBe('main');
		expect(calls[0]?.targetPath).toBe(resolve(workDir, 'Astro-portfolio'));
		expect(calls[0]?.baselineLabel).toBe('Astro-portfolio');
	});

	test('--name overrides the repo-derived folder name', async () => {
		const { calls, clone } = recordingClone();

		const code = await runNewCommand(
			['Gothsec/Astro-portfolio', '--root', workDir, '--name', 'my-site'],
			{ clone },
		);

		expect(code).toBe(0);
		expect(calls[0]?.targetPath).toBe(resolve(workDir, 'my-site'));
	});

	test('an unparsable source exits 2 without cloning', async () => {
		const { calls, clone } = recordingClone();

		const code = await runNewCommand(['https://gitlab.com/owner/repo', '--root', workDir], {
			clone,
		});

		expect(code).toBe(2);
		expect(calls).toHaveLength(0);
	});

	test('a missing source exits 2', async () => {
		const { calls, clone } = recordingClone();
		expect(await runNewCommand(['--root', workDir], { clone })).toBe(2);
		expect(calls).toHaveLength(0);
	});

	test('a non-empty existing target exits 1 without cloning', async () => {
		const target = join(workDir, 'taken');
		await mkdir(target, { recursive: true });
		await writeFile(join(target, 'file.txt'), 'x', 'utf8');
		const { calls, clone } = recordingClone();

		const code = await runNewCommand(['owner/repo', '--root', workDir, '--name', 'taken'], {
			clone,
		});

		expect(code).toBe(1);
		expect(calls).toHaveLength(0);
	});

	test('a failing clone exits 1 and removes the partial directory', async () => {
		const { clone } = recordingClone(128);

		const code = await runNewCommand(['owner/gone-repo', '--root', workDir], { clone });

		expect(code).toBe(1);
		const entries = await readdir(workDir);
		expect(entries).not.toContain('gone-repo');
	});
});
