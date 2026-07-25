import { describe, expect, test } from 'bun:test';
import {
	isPathWithinWorkspaceRoot,
	normalizePosixDrivePath,
} from '../../shared/src/agent/tools/shell-policy-paths.ts';

describe('normalizePosixDrivePath', () => {
	test('rewrites WSL-style /mnt/<drive> paths on win32', () => {
		expect(normalizePosixDrivePath('/mnt/d/applications/deeper', 'win32')).toBe(
			'd:/applications/deeper',
		);
		expect(normalizePosixDrivePath('/mnt/c', 'win32')).toBe('c:/');
	});

	test('rewrites Git-Bash-style /<drive> paths on win32', () => {
		expect(
			normalizePosixDrivePath('/d/applications/deeper/node_modules/.bin/tsc', 'win32'),
		).toBe('d:/applications/deeper/node_modules/.bin/tsc');
	});

	test('leaves non-drive POSIX paths and relative paths alone', () => {
		expect(normalizePosixDrivePath('/usr/bin/env', 'win32')).toBe('/usr/bin/env');
		expect(normalizePosixDrivePath('/tmp/x', 'win32')).toBe('/tmp/x');
		expect(normalizePosixDrivePath('src/index.ts', 'win32')).toBe('src/index.ts');
	});

	test('is a no-op off win32 (a real /d directory must not be rewritten)', () => {
		expect(normalizePosixDrivePath('/d/applications/deeper', 'linux')).toBe(
			'/d/applications/deeper',
		);
		expect(normalizePosixDrivePath('/mnt/d/x', 'linux')).toBe('/mnt/d/x');
	});
});

describe('isPathWithinWorkspaceRoot win32 drive spellings', () => {
	const root = 'D:\\workspace\\sample-app';

	test('accepts Git-Bash and WSL spellings of workspace paths', () => {
		expect(
			isPathWithinWorkspaceRoot(
				'/d/workspace/sample-app/node_modules/.bin/tsc',
				root,
				'win32',
			),
		).toBe(true);
		expect(isPathWithinWorkspaceRoot('/mnt/d/workspace/sample-app/src', root, 'win32')).toBe(
			true,
		);
	});

	test('still rejects genuinely outside paths in either spelling', () => {
		expect(isPathWithinWorkspaceRoot('/mnt/c/toolchains/bun/bin/bun.exe', root, 'win32')).toBe(
			false,
		);
		expect(isPathWithinWorkspaceRoot('/c/other/project', root, 'win32')).toBe(false);
		expect(isPathWithinWorkspaceRoot('/mnt/d/workspace/other', root, 'win32')).toBe(false);
	});
});
