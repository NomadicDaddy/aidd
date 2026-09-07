import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { degitClone, parseGithubTemplateSource } from 'aidd-shared/git/degit';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
describe('parseGithubTemplateSource', () => {
	const canonical = {
		cloneUrl: 'https://github.com/Gothsec/Astro-portfolio.git',
		owner: 'Gothsec',
		ref: null,
		repo: 'Astro-portfolio',
	};

	test.each([
		['https://github.com/Gothsec/Astro-portfolio'],
		['https://github.com/Gothsec/Astro-portfolio.git'],
		['https://github.com/Gothsec/Astro-portfolio/'],
		['github.com/Gothsec/Astro-portfolio'],
		['Gothsec/Astro-portfolio'],
		['  Gothsec/Astro-portfolio  '],
	])('accepts %s and constructs the canonical clone URL', (input) => {
		expect(parseGithubTemplateSource(input)).toEqual(canonical);
	});

	test('accepts a #ref suffix on any form', () => {
		expect(parseGithubTemplateSource('Gothsec/Astro-portfolio#main')).toEqual({
			...canonical,
			ref: 'main',
		});
		expect(
			parseGithubTemplateSource('https://github.com/Gothsec/Astro-portfolio#v1.2.3'),
		).toEqual({ ...canonical, ref: 'v1.2.3' });
		expect(parseGithubTemplateSource('Gothsec/Astro-portfolio#feature/nested')).toEqual({
			...canonical,
			ref: 'feature/nested',
		});
	});

	test.each([
		[''],
		['   '],
		['https://gitlab.com/owner/repo'],
		['https://github.com/owner'],
		['https://github.com/owner/repo/tree/main/sub'],
		['git@github.com:owner/repo.git'],
		['ssh://git@github.com/owner/repo'],
		['owner/repo#-upload-pack=evil'],
		['owner/repo#'],
		['owner/../repo'],
		['owner/..'],
		['ow ner/repo'],
	])('rejects %s', (input) => {
		expect(parseGithubTemplateSource(input)).toBeNull();
	});
});

describe('degitClone', () => {
	let workDir: string;

	beforeEach(async () => {
		workDir = await testTempDir('aidd-degit-');
	});

	afterEach(async () => {
		await removeTempTree(workDir);
	});

	async function git(cwd: string, args: string[]): Promise<{ code: number; stdout: string }> {
		const proc = Bun.spawn(['git', ...args], {
			cwd,
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
		return { code, stdout };
	}

	async function createFixtureRepo(): Promise<string> {
		const fixture = join(workDir, 'fixture');
		await Bun.write(join(fixture, 'README.md'), '# Fixture template\n');
		await writeFile(join(fixture, 'index.ts'), 'export const hello = 1;\n', 'utf8');
		await git(fixture, ['init']);
		await git(fixture, ['add', '.']);
		await git(fixture, [
			'-c',
			'user.email=test@example.com',
			'-c',
			'user.name=Test',
			'commit',
			'-m',
			'seed',
		]);
		return fixture;
	}

	test('clones a local repo, strips its history, and re-inits with a baseline root commit', async () => {
		const fixture = await createFixtureRepo();
		const targetPath = join(workDir, 'clone-target');

		const outcome = await degitClone({
			baselineLabel: 'fixture',
			cloneUrl: fixture,
			targetPath,
		});

		expect(outcome.code).toBe(0);
		const entries = await readdir(targetPath);
		expect(entries).toContain('README.md');
		expect(entries).toContain('index.ts');
		expect(entries).toContain('.git');
		// Fresh history: exactly one commit — the imported baseline — is the root.
		const revList = await git(targetPath, ['rev-list', '--count', 'HEAD']);
		expect(revList.code).toBe(0);
		expect(revList.stdout.trim()).toBe('1');
		const subject = await git(targetPath, ['log', '--format=%s', '-1']);
		expect(subject.stdout.trim()).toBe('chore: import fixture template baseline');
		// The whole imported tree is committed: nothing untracked or modified remains.
		const status = await git(targetPath, ['status', '--porcelain']);
		expect(status.code).toBe(0);
		expect(status.stdout.trim()).toBe('');
		// The source repo keeps its history untouched.
		const sourceRevs = await git(fixture, ['rev-list', '--count', 'HEAD']);
		expect(sourceRevs.code).toBe(0);
		expect(sourceRevs.stdout.trim()).toBe('1');
	});

	test('supplies a fallback identity for the baseline commit only when none is configured', async () => {
		const targetPath = join(workDir, 'identity-target');
		const seen: string[][] = [];
		const outcome = await degitClone({
			cloneUrl: 'https://github.com/owner/repo.git',
			run: (args) => {
				seen.push(args);
				// Identity probes report "unset" (non-zero, empty stdout); everything else succeeds.
				const isProbe = args[0] === 'config';
				return Promise.resolve({
					exitCode: isProbe ? 1 : 0,
					missing: false,
					ok: !isProbe,
					stderr: '',
					stdout: '',
				});
			},
			targetPath,
		});

		expect(outcome.code).toBe(0);
		expect(seen.map((args) => args[0])).toEqual([
			'clone',
			'init',
			'add',
			'config',
			'config',
			'-c',
		]);
		const commitArgs = seen.at(-1) ?? [];
		expect(commitArgs).toEqual([
			'-c',
			'user.name=aidd',
			'-c',
			'user.email=aidd@localhost',
			'commit',
			'--allow-empty',
			'-m',
			'chore: import template baseline',
		]);
	});

	test('a configured identity is never overridden for the baseline commit', async () => {
		const targetPath = join(workDir, 'configured-identity-target');
		const seen: string[][] = [];
		const outcome = await degitClone({
			baselineLabel: 'repo',
			cloneUrl: 'https://github.com/owner/repo.git',
			run: (args) => {
				seen.push(args);
				const isProbe = args[0] === 'config';
				return Promise.resolve({
					exitCode: 0,
					missing: false,
					ok: true,
					stderr: '',
					stdout: isProbe ? 'configured-value\n' : '',
				});
			},
			targetPath,
		});

		expect(outcome.code).toBe(0);
		const commitArgs = seen.at(-1) ?? [];
		expect(commitArgs).toEqual([
			'commit',
			'--allow-empty',
			'-m',
			'chore: import repo template baseline',
		]);
	});

	test('returns a nonzero code with stderr when the clone source does not exist', async () => {
		const targetPath = join(workDir, 'missing-target');
		const outcome = await degitClone({
			cloneUrl: join(workDir, 'does-not-exist'),
			targetPath,
		});
		expect(outcome.code).not.toBe(0);
		expect(outcome.stderr.length).toBeGreaterThan(0);
	});

	test('reports a missing git binary as a hard failure', async () => {
		const targetPath = join(workDir, 'no-git-target');
		const outcome = await degitClone({
			cloneUrl: 'https://github.com/owner/repo.git',
			run: () =>
				Promise.resolve({ exitCode: -1, missing: true, ok: false, stderr: '', stdout: '' }),
			targetPath,
		});
		expect(outcome.code).toBe(-1);
		expect(outcome.stderr).toContain('git executable not found on PATH');
	});
});
