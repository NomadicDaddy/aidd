import { describe, expect, test } from 'bun:test';
import {
	augmentEnvPathForGitBash,
	gitBashPathDirs,
	resolveBashExecutable,
	type BashResolverDeps,
	type GitBashEnvDeps,
} from '../../shared/src/agent/tools/bash-runtime.ts';

function deps(overrides: Partial<BashResolverDeps>): BashResolverDeps {
	return {
		env: {},
		existsSync: () => false,
		platform: 'win32',
		which: () => null,
		...overrides,
	};
}

describe('resolveBashExecutable', () => {
	test('non-win32 platforms use the PATH bash', () => {
		expect(resolveBashExecutable(deps({ platform: 'linux' }))).toEqual({ path: 'bash' });
	});

	test('derives Git Bash from the git on PATH', () => {
		const gitBash = 'C:\\Tools\\Git\\bin\\bash.exe';
		const result = resolveBashExecutable(
			deps({
				existsSync: (path) => path === gitBash,
				which: (cmd) => (cmd === 'git' ? 'C:\\Tools\\Git\\cmd\\git.exe' : null),
			})
		);
		expect(result).toEqual({ path: gitBash });
	});

	test('falls back to the usr/bin layout when bin/bash.exe is absent', () => {
		const usrBash = 'C:\\Tools\\Git\\usr\\bin\\bash.exe';
		const result = resolveBashExecutable(
			deps({
				existsSync: (path) => path === usrBash,
				which: (cmd) => (cmd === 'git' ? 'C:\\Tools\\Git\\cmd\\git.exe' : null),
			})
		);
		expect(result).toEqual({ path: usrBash });
	});

	test('falls back to the default install locations without git on PATH', () => {
		const defaultBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
		const result = resolveBashExecutable(deps({ existsSync: (path) => path === defaultBash }));
		expect(result).toEqual({ path: defaultBash });
	});

	test('AIDD_BASH override wins when it exists', () => {
		const custom = 'D:\\portable\\git\\bin\\bash.exe';
		const result = resolveBashExecutable(
			deps({ env: { AIDD_BASH: custom }, existsSync: (path) => path === custom })
		);
		expect(result).toEqual({ path: custom });
	});

	test('AIDD_BASH pointing at a missing file errors instead of silently falling back', () => {
		const result = resolveBashExecutable(deps({ env: { AIDD_BASH: 'X:\\nope\\bash.exe' } }));
		expect(result).toMatchObject({ error: expect.stringContaining('no file exists') });
	});

	test('rejects the System32 WSL shim even via AIDD_BASH', () => {
		const shim = 'C:\\Windows\\System32\\bash.exe';
		const result = resolveBashExecutable(
			deps({ env: { AIDD_BASH: shim }, existsSync: (path) => path === shim })
		);
		expect(result).toMatchObject({ error: expect.stringContaining('WSL bash shim') });
	});

	test('reports the actionable install hint when nothing is found', () => {
		const result = resolveBashExecutable(deps({}));
		if (!('error' in result)) throw new Error('expected an error result');
		expect(result.error).toContain('Install Git for Windows');
		expect(result.error).toContain('Exec format error');
	});
});

function envDeps(overrides: Partial<GitBashEnvDeps>): GitBashEnvDeps {
	return {
		existsSync: () => true,
		platform: 'win32',
		...overrides,
	};
}

describe('gitBashPathDirs', () => {
	test('derives the toolchain dirs from a bin\\bash.exe layout', () => {
		expect(gitBashPathDirs('C:\\Tools\\Git\\bin\\bash.exe', envDeps({}))).toEqual([
			'C:\\Tools\\Git\\mingw64\\bin',
			'C:\\Tools\\Git\\usr\\bin',
			'C:\\Tools\\Git\\bin',
		]);
	});

	test('derives the same root from a usr\\bin\\bash.exe layout', () => {
		expect(gitBashPathDirs('C:\\Tools\\Git\\usr\\bin\\bash.exe', envDeps({}))).toEqual([
			'C:\\Tools\\Git\\mingw64\\bin',
			'C:\\Tools\\Git\\usr\\bin',
			'C:\\Tools\\Git\\bin',
		]);
	});

	test('drops dirs that do not exist and yields nothing off-win32 or off-layout', () => {
		const onlyUsrBin = envDeps({
			existsSync: (path) => path === 'C:\\Tools\\Git\\usr\\bin',
		});
		expect(gitBashPathDirs('C:\\Tools\\Git\\bin\\bash.exe', onlyUsrBin)).toEqual([
			'C:\\Tools\\Git\\usr\\bin',
		]);
		expect(gitBashPathDirs('/usr/bin/bash', envDeps({ platform: 'linux' }))).toEqual([]);
		expect(gitBashPathDirs('D:\\odd\\place\\bash.exe', envDeps({}))).toEqual([]);
	});
});

describe('augmentEnvPathForGitBash', () => {
	const bash = 'C:\\Tools\\Git\\bin\\bash.exe';

	test('prepends the toolchain dirs to every PATH-shaped key', () => {
		const env = augmentEnvPathForGitBash(
			bash,
			{ PATH: 'C:\\Windows\\System32', Path: 'C:\\Windows\\System32' },
			envDeps({})
		);
		const expected =
			'C:\\Tools\\Git\\mingw64\\bin;C:\\Tools\\Git\\usr\\bin;C:\\Tools\\Git\\bin;C:\\Windows\\System32';
		expect(env.PATH).toBe(expected);
		expect(env.Path).toBe(expected);
	});

	test('does not repeat dirs already on PATH', () => {
		const current = 'c:\\tools\\git\\usr\\bin;C:\\Windows\\System32';
		const env = augmentEnvPathForGitBash(bash, { PATH: current }, envDeps({}));
		expect(env.PATH).toBe(`C:\\Tools\\Git\\mingw64\\bin;C:\\Tools\\Git\\bin;${current}`);
	});

	test('sets PATH outright when the env has none', () => {
		const env = augmentEnvPathForGitBash(bash, {}, envDeps({}));
		expect(env.PATH).toBe(
			'C:\\Tools\\Git\\mingw64\\bin;C:\\Tools\\Git\\usr\\bin;C:\\Tools\\Git\\bin'
		);
	});

	test('returns the env untouched off-win32', () => {
		const base = { PATH: '/usr/bin' };
		expect(augmentEnvPathForGitBash('bash', base, envDeps({ platform: 'linux' }))).toBe(base);
	});
});
