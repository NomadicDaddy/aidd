import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import { runs } from '../../backend/src/db/schema.ts';
import {
	makeLauncherRoot,
	makeProject,
	makeService,
	spawnWitness,
	spawnWitnessCount,
	waitForWitnessCount,
} from './_helpers/admission-harness.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

const TWO_DAYS_MS = 2 * 86_400_000;

describe('run admission queue edges', () => {
	test('a queued row older than the recent-run lookback is still listed', async () => {
		const workspace = await testTempDir('aidd-admit-old-');
		const rootDir = await makeLauncherRoot('await Bun.sleep(1500);\n');
		try {
			const projectDir = await makeProject(workspace);
			const { db, service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
				web: { maxConcurrentRuns: 0, maxConcurrentRunsPerProject: 2 },
			});
			try {
				const queued = await service.launchRun({ projectDir }, { initiator: 'operator' });
				await db
					.update(runs)
					.set({ startedAt: Date.now() - TWO_DAYS_MS })
					.where(eq(runs.id, queued.id));
				const listed = await service.listRuns();
				expect(listed.map((run) => run.id)).toContain(queued.id);
				const page = await service.listRunsPage();
				expect(page.items.map((run) => run.id)).toContain(queued.id);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('a background-admitted run that cannot spawn is kept as failed, not deleted', async () => {
		const workspace = await testTempDir('aidd-admit-spawnfail-');
		const witnessDir = join(workspace, 'spawn-witness');
		const rootDir = await makeLauncherRoot(
			`${spawnWitness(witnessDir)}\nawait Bun.sleep(1500);\n`,
		);
		try {
			const projectDir = await makeProject(workspace);
			const { db, service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
				web: { maxConcurrentRuns: 1, maxConcurrentRunsPerProject: 2 },
			});
			try {
				const first = await service.launchRun({ projectDir }, { initiator: 'operator' });
				const broken = await service.launchRun({ projectDir }, { initiator: 'operator' });
				const next = await service.launchRun({ projectDir }, { initiator: 'operator' });
				await waitForWitnessCount(witnessDir, 1);
				// Valid JSON (the CHECK allows it) that is not an argv array: promotion succeeds and
				// the spawn step refuses it, which is the background spawn-failure path.
				await db
					.update(runs)
					.set({ commandArgsJson: '{"corrupt":true}' })
					.where(eq(runs.id, broken.id));
				await db
					.update(runs)
					.set({ completedAt: Date.now(), status: 'completed' })
					.where(eq(runs.id, first.id));
				await service.admitQueuedRuns();
				const brokenRow = await service.getRun(broken.id);
				expect(brokenRow?.status).toBe('failed');
				expect(brokenRow?.errorMessage).toContain('Queued run could not be started');
				// The failure frees the slot, so the same pass admits the next queued run.
				await waitForWitnessCount(witnessDir, 2);
				expect((await service.getRun(next.id))?.status).toBe('running');
				expect(await spawnWitnessCount(witnessDir)).toBe(2);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});
});
