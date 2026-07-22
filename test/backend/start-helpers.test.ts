import { describe, expect, test } from 'bun:test';
import { createRestartSupervisorSpawnOptions } from '../../backend/src/startHelpers.ts';

describe('web start helpers', () => {
	test('spawns restart supervisor with explicit detached Windows-safe options', () => {
		const options = createRestartSupervisorSpawnOptions('D:/applications/aidd', 1, 2);

		expect(options).toEqual({
			cwd: 'D:/applications/aidd',
			detached: true,
			stderr: 2,
			stdin: 'ignore',
			stdout: 1,
			windowsHide: true,
		});
	});
});
