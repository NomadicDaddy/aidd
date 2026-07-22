import { describe, expect, test } from 'bun:test';

import {
	createBackendForegroundSpawnOptions,
	createBackendSpawnOptions,
	parseStartWebArgs,
	resolveReleasePort,
} from '../../scripts/start-web.ts';

describe('start-web restart supervisor args', () => {
	test('defaults release wait to the target configured port', () => {
		const options = parseStartWebArgs(['--wait-for-release']);

		expect(options).toEqual({
			foreground: false,
			waitForRelease: true,
			waitForReleasePort: null,
		});
		expect(resolveReleasePort(options, 4555)).toBe(4555);
	});

	test('can wait for the active listener port during a port-changing restart', () => {
		const options = parseStartWebArgs([
			'--wait-for-release',
			'--wait-for-release-port',
			'3210',
		]);

		expect(options).toEqual({
			foreground: false,
			waitForRelease: true,
			waitForReleasePort: 3210,
		});
		expect(resolveReleasePort(options, 4555)).toBe(3210);
	});

	test('can run the web backend in the foreground', () => {
		const options = parseStartWebArgs(['--foreground']);

		expect(options).toEqual({
			foreground: true,
			waitForRelease: false,
			waitForReleasePort: null,
		});
	});

	test('rejects invalid release ports', () => {
		expect(() =>
			parseStartWebArgs(['--wait-for-release', '--wait-for-release-port', '70000'])
		).toThrow(/wait-for-release-port/);
	});

	test('spawns the web backend with explicit detached Windows-safe options', () => {
		const options = createBackendSpawnOptions(1, 2);

		expect(options).toMatchObject({
			detached: true,
			stderr: 2,
			stdin: 'ignore',
			stdout: 1,
			windowsHide: true,
		});
		expect(options.cwd.replace(/\\/g, '/')).toEndWith('/backend');
	});

	test('spawns the foreground web backend with inherited stdio', () => {
		const options = createBackendForegroundSpawnOptions();

		expect(options).toMatchObject({
			stderr: 'inherit',
			stdin: 'inherit',
			stdout: 'inherit',
			windowsHide: true,
		});
		expect('detached' in options).toBe(false);
		expect(options.cwd.replace(/\\/g, '/')).toEndWith('/backend');
	});
});
