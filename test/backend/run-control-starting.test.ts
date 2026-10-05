import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';

import { killRun, stopRun } from '../../backend/src/services/run/control.ts';
import { runStopFilePath } from '../../shared/src/metadata/paths.ts';
import { controlFixture } from './_helpers/control-fixture.ts';

// A detached run has no pid on its row and no heartbeat file until its CLI has come up. Stop used
// to read that as a dead process: it marked the row stopped and deleted the stop file, and the
// child then started and ran with nothing left to stop it. Kill marked the row killed the same way.

test('stop on a run that is still starting leaves the row running and the stop file in place', async () => {
	const fixture = await controlFixture('starting', Date.now());
	try {
		await stopRun(fixture.ctx, 'starting');

		expect(fixture.status()).toEqual({ status: 'running' });
		expect(existsSync(runStopFilePath(fixture.projectPath, 'starting'))).toBe(true);
	} finally {
		await fixture.cleanup();
	}
});

test('kill on a run that is still starting marks it killed and leaves a stop request for the child', async () => {
	const fixture = await controlFixture('starting', Date.now());
	try {
		await killRun(fixture.ctx, 'starting');

		expect(fixture.status()).toEqual({ status: 'killed' });
		expect(existsSync(runStopFilePath(fixture.projectPath, 'starting'))).toBe(true);
	} finally {
		await fixture.cleanup();
	}
});

// Past the startup window a row with no pid and no heartbeat is a dead run, as before.
test.each(['kill', 'stop'] as const)(
	'%s on a pidless run past the startup window still ends the row and clears the stop file',
	async (action) => {
		const fixture = await controlFixture('starting', 1);
		try {
			await (action === 'kill'
				? killRun(fixture.ctx, 'starting')
				: stopRun(fixture.ctx, 'starting'));

			expect(fixture.status()).toEqual({ status: action === 'kill' ? 'killed' : 'stopped' });
			expect(existsSync(runStopFilePath(fixture.projectPath, 'starting'))).toBe(false);
		} finally {
			await fixture.cleanup();
		}
	},
);
