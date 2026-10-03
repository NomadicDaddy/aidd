import { describe, expect, test } from 'bun:test';
import {
	createCliActiveRunRecord,
	writeCliActiveRunRecord,
} from 'aidd-shared/metadata/active-runs';
import { join } from 'node:path';

import {
	findCliActiveRun,
	listCliActiveRuns,
} from '../../backend/src/services/run/cliActiveRuns.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';

// Every first page of the runs list walked every application root for projects holding CLI run
// records, about 240 ms a request (frontend re-audit, 2026-10-03). The walk is now reused for a
// few seconds. These pin the two edges of that: a project that appears inside the window is not
// listed until the walk is redone, and a lookup by id never depends on the window.
function activeRun(projectDir: string, id: string) {
	return createCliActiveRunRecord({
		backend: 'native',
		id,
		mode: 'coding',
		model: undefined,
		projectDir,
		provider: undefined,
		reasoningEffort: 'low',
	});
}

function context(root: string) {
	return {
		config: { web: { allowedRoots: [root], ignoredFolders: [] } },
		hub: new WebSocketHub(),
	} as unknown as Parameters<typeof listCliActiveRuns>[0];
}

describe('reusing the CLI run project walk', () => {
	test('a listing inside the window reuses the walk, and a fresh listing finds the new project', async () => {
		const root = await testTempDir('aidd-cli-walk-reuse-');
		try {
			const ctx = context(root);
			await writeCliActiveRunRecord(activeRun(join(root, 'first'), 'run_first'));
			expect((await listCliActiveRuns(ctx)).map((run) => run.id)).toEqual(['run_first']);

			await writeCliActiveRunRecord(activeRun(join(root, 'second'), 'run_second'));
			// Reused walk: the second project is not known yet, though its record exists.
			expect((await listCliActiveRuns(ctx)).map((run) => run.id)).toEqual(['run_first']);
			// A record added to a project the walk already knows is read fresh.
			await writeCliActiveRunRecord(activeRun(join(root, 'first'), 'run_first_again'));
			expect((await listCliActiveRuns(ctx)).map((run) => run.id).sort()).toEqual([
				'run_first',
				'run_first_again',
			]);

			const fresh = (await listCliActiveRuns(ctx, true)).map((run) => run.id).sort();
			expect(fresh).toEqual(['run_first', 'run_first_again', 'run_second']);
		} finally {
			await removeTempTree(root);
		}
	});

	test('a lookup by id finds a run in a project the reused walk has not seen', async () => {
		const root = await testTempDir('aidd-cli-walk-find-');
		try {
			const ctx = context(root);
			await writeCliActiveRunRecord(activeRun(join(root, 'first'), 'run_first'));
			await listCliActiveRuns(ctx);
			await writeCliActiveRunRecord(activeRun(join(root, 'later'), 'run_later'));
			expect((await findCliActiveRun(ctx, 'run_later'))?.id).toBe('run_later');
			expect(await findCliActiveRun(ctx, 'run_missing')).toBeUndefined();
		} finally {
			await removeTempTree(root);
		}
	});
});
