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
	wait,
	waitForWitnessCount,
} from './_helpers/admission-harness.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

describe('run admission queue', () => {
	test('maxConcurrentRuns=1 with three web launches yields one running and two queued', async () => {
		const workspace = await testTempDir('aidd-admit-three-');
		const witnessDir = join(workspace, 'spawn-witness');
		const rootDir = await makeLauncherRoot(
			`${spawnWitness(witnessDir)}\nawait Bun.sleep(1500);\n`,
		);
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
				web: { maxConcurrentRuns: 1, maxConcurrentRunsPerProject: 2 },
			});
			try {
				const first = await service.launchRun({ projectDir }, { initiator: 'operator' });
				const second = await service.launchRun({ projectDir }, { initiator: 'operator' });
				const third = await service.launchRun({ projectDir }, { initiator: 'operator' });
				await waitForWitnessCount(witnessDir, 1);
				expect(first.status).toBe('running');
				expect(second.status).toBe('queued');
				expect(third.status).toBe('queued');
				expect(await spawnWitnessCount(witnessDir)).toBe(1);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('completing the running run admits the oldest queued', async () => {
		const workspace = await testTempDir('aidd-admit-complete-');
		const witnessDir = join(workspace, 'spawn-witness');
		const rootDir = await makeLauncherRoot(
			`${spawnWitness(witnessDir)}\nawait Bun.sleep(2000);\n`,
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
				const second = await service.launchRun({ projectDir }, { initiator: 'operator' });
				await service.launchRun({ projectDir }, { initiator: 'operator' });
				await waitForWitnessCount(witnessDir, 1);
				await db
					.update(runs)
					.set({ status: 'completed', completedAt: Date.now() })
					.where(eq(runs.id, first.id));
				await service.admitQueuedRuns();
				await waitForWitnessCount(witnessDir, 2);
				const secondRow = await service.getRun(second.id);
				expect(secondRow?.status).toBe('running');
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('a per-project ceiling of 1 leaves the second launch queued when global has room', async () => {
		const workspace = await testTempDir('aidd-admit-project-');
		const witnessDir = join(workspace, 'spawn-witness');
		const rootDir = await makeLauncherRoot(
			`${spawnWitness(witnessDir)}\nawait Bun.sleep(1500);\n`,
		);
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
				web: { maxConcurrentRuns: 5, maxConcurrentRunsPerProject: 1 },
			});
			try {
				const first = await service.launchRun({ projectDir }, { initiator: 'operator' });
				const second = await service.launchRun({ projectDir }, { initiator: 'operator' });
				await waitForWitnessCount(witnessDir, 1);
				expect(first.status).toBe('running');
				expect(second.status).toBe('queued');
				expect(await spawnWitnessCount(witnessDir)).toBe(1);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('stop of a queued run does not spawn', async () => {
		const workspace = await testTempDir('aidd-admit-stop-');
		const witnessDir = join(workspace, 'spawn-witness');
		const rootDir = await makeLauncherRoot(
			`${spawnWitness(witnessDir)}\nawait Bun.sleep(1500);\n`,
		);
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
				web: { maxConcurrentRuns: 1, maxConcurrentRunsPerProject: 2 },
			});
			try {
				await service.launchRun({ projectDir }, { initiator: 'operator' });
				const queued = await service.launchRun({ projectDir }, { initiator: 'operator' });
				await waitForWitnessCount(witnessDir, 1);
				await service.stopRun(queued.id);
				await wait(300);
				expect((await service.getRun(queued.id))?.status).toBe('stopped');
				expect(await spawnWitnessCount(witnessDir)).toBe(1);
			} finally {
				service.markDisposed();
				sqlite.close();
			}
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(rootDir);
		}
	});

	test('boot reconciliation leaves queued rows queued', async () => {
		const workspace = await testTempDir('aidd-admit-boot-');
		const rootDir = await makeLauncherRoot('await Bun.sleep(1500);\n');
		try {
			const projectDir = await makeProject(workspace);
			const { service, sqlite } = makeService({
				allowedRoot: workspace,
				dataDir: join(workspace, 'data'),
				rootDir,
				web: { maxConcurrentRuns: 0, maxConcurrentRunsPerProject: 2 },
			});
			try {
				const queued = await service.launchRun({ projectDir }, { initiator: 'operator' });
				expect(queued.status).toBe('queued');
				await service.reconcileStaleRuns();
				expect((await service.getRun(queued.id))?.status).toBe('queued');
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
