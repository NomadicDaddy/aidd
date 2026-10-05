import { describe, expect, test } from 'bun:test';

import { runProcessLiveness } from '../../shared/src/metadata/active-runs/liveness.ts';

const self = { pid: process.pid, ppid: 0, startId: 'me' };

describe('runProcessLiveness', () => {
	test('no pid, or a pid that is gone, is dead', async () => {
		expect(await runProcessLiveness(null, 'me')).toBe('dead');
		expect(await runProcessLiveness(2_147_483_646, 'me')).toBe('dead');
	});

	test('a live pid with the recorded start time is alive; a different one is dead', async () => {
		const read = () => Promise.resolve(self);
		expect(await runProcessLiveness(process.pid, 'me', read)).toBe('alive');
		expect(await runProcessLiveness(process.pid, 'someone-else', read)).toBe('dead');
	});

	test('identity that cannot be checked is unknown, never alive', async () => {
		// A record written before start times were recorded, or a platform that reports none.
		expect(await runProcessLiveness(process.pid, null, () => Promise.resolve(self))).toBe(
			'unknown',
		);
		expect(
			await runProcessLiveness(process.pid, 'me', () =>
				Promise.resolve({ pid: process.pid, ppid: 0 }),
			),
		).toBe('unknown');
	});
});
