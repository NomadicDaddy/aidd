import { describe, expect, test } from 'bun:test';
import { platform } from 'node:os';
import { join, resolve } from 'node:path';
import {
	assertAllowedPath,
	buildProjectRouteIds,
	matchesProjectRouteDisambiguator,
	pathIsInside,
} from '../../backend/src/paths.ts';
import { ShellCommandRunner } from '../../backend/src/services/pipeline/shellCommandRunner.ts';

const onWindows = platform() === 'win32';

describe('project route IDs', () => {
	test('uses the project basename when it is unique', () => {
		const project = resolve('/tmp/aidd-routes/alpha');
		expect(buildProjectRouteIds([project]).get(project)).toBe('alpha');
	});

	test('adds a stable short disambiguator only for duplicate basenames', () => {
		const first = resolve('/tmp/aidd-routes/one/alpha');
		const second = resolve('/tmp/aidd-routes/two/alpha');
		const routeIds = buildProjectRouteIds([first, second]);
		const firstRouteId = routeIds.get(first);
		const secondRouteId = routeIds.get(second);
		expect(firstRouteId).toMatch(/^alpha~[a-f0-9]{8,}$/);
		expect(secondRouteId).toMatch(/^alpha~[a-f0-9]{8,}$/);
		expect(firstRouteId).not.toBe(secondRouteId);
		expect(matchesProjectRouteDisambiguator(first, firstRouteId!.split('~').at(-1)!)).toBe(
			true,
		);
	});
});

describe('pathIsInside', () => {
	test('treats identical paths as inside', () => {
		const parent = resolve('/tmp/aidd-paths-same');
		expect(pathIsInside(parent, parent)).toBe(true);
	});

	test('accepts a nested child path', () => {
		const parent = resolve('/tmp/aidd-paths-nested');
		const child = join(parent, 'sub', 'leaf');
		expect(pathIsInside(parent, child)).toBe(true);
	});

	test('rejects a sibling path outside the parent', () => {
		const parent = resolve('/tmp/aidd-paths-sibling');
		const sibling = resolve('/tmp/aidd-paths-other');
		expect(pathIsInside(parent, sibling)).toBe(false);
	});

	test('rejects a parent path', () => {
		const parent = resolve('/tmp/aidd-paths-parent');
		const ancestor = resolve('/tmp');
		expect(pathIsInside(parent, ancestor)).toBe(false);
	});

	// Regression: on Windows, node:path.relative() returns an ABSOLUTE path when parent and
	// candidate live on different drives (e.g. relative('C:\\foo','D:\\bar') === 'D:\\bar').
	// That absolute string starts with neither '..' nor '..\\', so the previous prefix-only
	// check silently treated it as "inside" the allowed root. The fix is the isAbsolute()
	// short-circuit in backend/src/paths.ts.
	test.if(onWindows)('rejects a cross-drive candidate (Windows)', () => {
		expect(pathIsInside('C:\\aidd-roots\\workspace', 'D:\\evil')).toBe(false);
		expect(pathIsInside('C:\\aidd-roots\\workspace', 'D:\\aidd-roots\\workspace\\sub')).toBe(
			false,
		);
	});
});

describe('assertAllowedPath', () => {
	test('returns the resolved path when allowed', () => {
		const root = resolve('/tmp/aidd-allowed-root');
		const candidate = join(root, 'project');
		expect(assertAllowedPath([root], candidate)).toBe(candidate);
	});

	test('throws when the candidate sits outside every allowed root', () => {
		const root = resolve('/tmp/aidd-allowed-root');
		const candidate = resolve('/tmp/aidd-outside-root');
		expect(() => assertAllowedPath([root], candidate)).toThrow('Path is outside allowed roots');
	});

	// Regression for audit-security-1779339974-cross-drive-paths-bypass-allowed-root-containment.
	test.if(onWindows)('rejects a cross-drive candidate (Windows)', () => {
		expect(() => assertAllowedPath(['C:\\aidd-roots\\workspace'], 'D:\\evil')).toThrow(
			'Path is outside allowed roots',
		);
	});
});

describe('ShellCommandRunner cwd guard', () => {
	test('rejects a cwd outside allowed roots before spawning a process', async () => {
		const allowedRoot = resolve('/tmp/aidd-shell-allowed');
		const runner = new ShellCommandRunner({
			activeShellProcesses: new Map(),
			getAllowedRoots: () => [allowedRoot],
		});
		const outsideCwd = resolve('/tmp/aidd-shell-outside');
		// If the guard is missing or weakened, Bun.spawn would fire with this bogus cwd and
		// either succeed (because the directory exists) or throw ENOENT — neither of which is
		// what we want. The contract is a structured failure result with an explanatory message.
		const result = await runner.run('echo should-not-run', outsideCwd, 'session-test');
		expect(result.ok).toBe(false);
		expect(result.errorMessage).toBe('Shell step cwd is outside allowed roots');
		expect(result.exitCode).toBeUndefined();
	});

	test.if(onWindows)('rejects a cross-drive cwd before spawning (Windows)', async () => {
		const runner = new ShellCommandRunner({
			activeShellProcesses: new Map(),
			getAllowedRoots: () => ['C:\\aidd-shell-allowed'],
		});
		const result = await runner.run('echo should-not-run', 'D:\\evil', 'session-test');
		expect(result.ok).toBe(false);
		expect(result.errorMessage).toBe('Shell step cwd is outside allowed roots');
	});
});
