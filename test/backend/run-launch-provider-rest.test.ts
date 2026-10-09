import { writeProviderRest } from 'aidd-shared/provider-rest/store';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { join } from 'node:path';

import { runs } from '../../backend/src/db/schema.ts';
import { ProviderRestingError } from '../../backend/src/services/errors.ts';
import { testTempDir } from '../_helpers/temp.ts';
import {
	makeLauncherRoot,
	makeProject,
	makeService,
	spawnWitness,
	waitForWitnessCount,
} from './_helpers/admission-harness.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// The harness config's default backend is native; resting it is what every case here turns on.
async function withRestingNative(
	body: (input: {
		db: ReturnType<typeof makeService>['db'];
		projectDir: string;
		service: ReturnType<typeof makeService>['service'];
		witnessDir: string;
	}) => Promise<void>,
): Promise<void> {
	const workspace = await testTempDir('aidd-launch-rest-');
	const witnessDir = join(workspace, 'spawn-witness');
	const rootDir = await makeLauncherRoot(`${spawnWitness(witnessDir)}\nawait Bun.sleep(200);\n`);
	const dataDir = join(workspace, 'data');
	try {
		const now = Date.now();
		await writeProviderRest(dataDir, {
			backend: 'native',
			reason: 'quota',
			source: 'manual',
			setAt: new Date(now).toISOString(),
			until: new Date(now + 30 * 60_000).toISOString(),
		});
		const projectDir = await makeProject(workspace);
		const { db, service, sqlite } = makeService({ allowedRoot: workspace, dataDir, rootDir });
		try {
			await body({ db, projectDir, service, witnessDir });
		} finally {
			service.markDisposed();
			sqlite.close();
		}
	} finally {
		await removeTempTree(workspace);
		await removeTempTree(rootDir);
	}
}

describe('web launch under provider rest', () => {
	test('a standing launch substitutes, records why, and tells the CLI not to decide again', async () => {
		await withRestingNative(async ({ db, projectDir, service, witnessDir }) => {
			const run = await service.launchRun({ projectDir }, { initiator: 'automatic' });
			await waitForWitnessCount(witnessDir, 1);
			const row = await db.select().from(runs).where(eq(runs.id, run.id)).get();
			expect(row?.backend).toBe('codex');
			expect(row?.backendSubstitution).toStartWith(
				'codex, substituted for native: resting until ',
			);
			const args = JSON.parse(row?.commandArgsJson ?? '[]') as string[];
			expect(args[args.indexOf('--cli') + 1]).toBe('codex');
			expect(args).toContain('--ignore-rest');
		});
	});

	test('a person who picked the resting backend is refused before any run exists', async () => {
		await withRestingNative(async ({ db, projectDir, service }) => {
			let refused: unknown;
			try {
				await service.launchRun(
					{ backend: 'native', projectDir },
					{ backendChoice: 'person', initiator: 'operator' },
				);
			} catch (error) {
				refused = error;
			}
			expect(refused).toBeInstanceOf(ProviderRestingError);
			if (!(refused instanceof ProviderRestingError)) return;
			expect(refused.status).toBe(409);
			expect(refused.details.alternative).toBe('codex');
			expect(refused.details.backend).toBe('native');
			expect(await db.select().from(runs).all()).toEqual([]);
		});
	});

	test('run anyway starts the resting backend with no substitution recorded', async () => {
		await withRestingNative(async ({ db, projectDir, service, witnessDir }) => {
			const run = await service.launchRun(
				{ backend: 'native', ignoreRest: true, projectDir },
				{ backendChoice: 'person', initiator: 'operator' },
			);
			await waitForWitnessCount(witnessDir, 1);
			const row = await db.select().from(runs).where(eq(runs.id, run.id)).get();
			expect(row?.backend).toBe('native');
			expect(row?.backendSubstitution).toBeNull();
		});
	});
});
