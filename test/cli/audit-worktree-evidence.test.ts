import { FileAiddStore } from 'aidd-shared/metadata/store';
import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	prepareWorktreeRun,
	rollbackWorktreeRun,
} from '../../cli/src/orchestrator/run/worktree-run-setup.ts';
import { createAuditWorktreeFixtures } from './_helpers/audit-worktree-fixture.ts';

const { cleanup, fixture } = createAuditWorktreeFixtures();
afterEach(cleanup);

test('audit rollback discards forged iteration files and keeps canonical runtime evidence', async () => {
	const { plan, root } = await fixture();
	const store = new FileAiddStore(root);
	await store.writeIteration({ log: 'trusted runtime log', structured: { runId: 'trusted' } });
	const canonical = join(root, '.aidd', 'iterations');
	const before = (await readdir(canonical)).sort();
	await prepareWorktreeRun({
		launcherManaged: false,
		plan,
		requested: false,
		runId: 'rollback',
		webDataDir: join(root, 'data'),
	});
	const checkout = plan.worktree!.dir;
	const forged = join(checkout, '.aidd', 'iterations');
	await mkdir(forged, { recursive: true });
	await writeFile(join(forged, '001.log'), 'forged agent log');
	await writeFile(join(forged, '001.json'), '{}');
	await rollbackWorktreeRun(plan);
	expect(existsSync(checkout)).toBe(false);
	expect((await readdir(canonical)).sort()).toEqual(before);
	expect(await readFile(join(canonical, '001.log'), 'utf8')).toBe('trusted runtime log');
});
