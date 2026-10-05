import { expect, test } from 'bun:test';

import type { QueriesContext } from '../../backend/src/services/run/queryContracts.ts';

import { reconcileStaleRuns } from '../../backend/src/services/run/activeRunReconcile.ts';
import { controlFixture } from './_helpers/control-fixture.ts';

// A web restart while a detached run is between spawn and its first heartbeat used to fail the
// row at once (no startup grace on the boot path), reap its worktree, and free its ceiling slot,
// while the child went on running. The in-session sweep already spared such a run; boot now does
// the same and leaves it to that sweep.

test('boot leaves a run that is still inside its startup window running', async () => {
	const fixture = await controlFixture('just_launched', Date.now() - 5_000);
	try {
		await reconcileStaleRuns(fixture.ctx as unknown as QueriesContext);
		expect(fixture.status()).toEqual({ status: 'running' });
	} finally {
		await fixture.cleanup();
	}
});

test('boot still fails a heartbeat-less run that is past its startup window', async () => {
	const fixture = await controlFixture('long_gone', Date.now() - 10 * 60_000);
	try {
		await reconcileStaleRuns(fixture.ctx as unknown as QueriesContext);
		expect(fixture.status()).toEqual({ status: 'failed' });
	} finally {
		await fixture.cleanup();
	}
});
