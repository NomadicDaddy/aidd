import { describe, expect, test } from 'bun:test';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { stampCompletedFeatures } from '../../cli/src/orchestrator/run/completion-persistence.ts';
import { testTempDir } from '../_helpers/temp.ts';

const AT = '2026-08-21T10:00:00.000Z';

async function writeFeatureFile(
	projectDir: string,
	directory: string,
	fields: Record<string, unknown>,
): Promise<void> {
	const path = join(projectDir, '.aidd', 'features', directory, 'feature.json');
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		`${JSON.stringify({ description: 'work', id: directory, title: directory, ...fields }, null, '\t')}\n`,
	);
}

async function readFeatureFile(
	projectDir: string,
	directory: string,
): Promise<Record<string, unknown>> {
	const raw = await readFile(
		join(projectDir, '.aidd', 'features', directory, 'feature.json'),
		'utf8',
	);
	return JSON.parse(raw) as Record<string, unknown>;
}

describe('stampCompletedFeatures', () => {
	// The normal `→ completed` flip is the agent editing feature.json on disk — nothing goes
	// through the store — so on the common success path this is the only thing that dates it.
	test('dates a feature the agent completed on disk without a store write', async () => {
		const projectDir = await testTempDir('aidd-stamp-completed-');
		await writeFeatureFile(projectDir, 'done-feature', { passes: true, status: 'completed' });

		await stampCompletedFeatures(new FileAiddStore(projectDir), ['done-feature'], AT);

		expect(await readFeatureFile(projectDir, 'done-feature')).toMatchObject({
			completedAt: AT,
		});
	});

	// finalize.ts calls this without an instant, so the default is the production path — and one
	// default per call is what keeps a batch from drifting across the loop.
	test('defaults to now and shares that one instant across the whole batch', async () => {
		const projectDir = await testTempDir('aidd-stamp-batch-');
		await writeFeatureFile(projectDir, 'first', { passes: true, status: 'completed' });
		await writeFeatureFile(projectDir, 'second', { passes: true, status: 'completed' });

		await stampCompletedFeatures(new FileAiddStore(projectDir), ['first', 'second']);

		const stamped = (await readFeatureFile(projectDir, 'first')).completedAt;
		expect(typeof stamped).toBe('string');
		expect(Number.isNaN(Date.parse(stamped as string))).toBe(false);
		expect((await readFeatureFile(projectDir, 'second')).completedAt).toBe(stamped);
	});

	// The finalize call site sits inside the `!completionPendingCommit` branch, so a completion
	// parkCompletionsPendingCommit demoted never reaches here — and if it did, the status guard
	// would refuse it rather than dating a feature that is waiting on approval.
	test('refuses anything that is not a passing completion', async () => {
		const projectDir = await testTempDir('aidd-stamp-guarded-');
		await writeFeatureFile(projectDir, 'parked', { passes: false, status: 'waiting_approval' });
		await writeFeatureFile(projectDir, 'unverified', { status: 'completed' });

		await stampCompletedFeatures(new FileAiddStore(projectDir), ['parked', 'unverified'], AT);

		expect((await readFeatureFile(projectDir, 'parked')).completedAt).toBeUndefined();
		expect((await readFeatureFile(projectDir, 'unverified')).completedAt).toBeUndefined();
	});

	test('leaves an already-dated completion at its original instant', async () => {
		const projectDir = await testTempDir('aidd-stamp-idempotent-');
		await writeFeatureFile(projectDir, 'old', {
			completedAt: '2026-01-01T00:00:00.000Z',
			passes: true,
			status: 'completed',
		});

		await stampCompletedFeatures(new FileAiddStore(projectDir), ['old'], AT);

		expect((await readFeatureFile(projectDir, 'old')).completedAt).toBe(
			'2026-01-01T00:00:00.000Z',
		);
	});

	test('skips a feature id with no record on disk instead of throwing', async () => {
		const projectDir = await testTempDir('aidd-stamp-missing-');
		expect(
			await stampCompletedFeatures(new FileAiddStore(projectDir), ['never-existed'], AT),
		).toBeUndefined();
	});
});
