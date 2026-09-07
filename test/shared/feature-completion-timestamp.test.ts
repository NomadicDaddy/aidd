import { describe, expect, test } from 'bun:test';
import { type Feature } from 'aidd-shared/metadata/features';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { applyCompletionTimestamp } from 'aidd-shared/metadata/store/status-policy';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { testTempDir } from '../_helpers/temp.ts';

const AT = new Date('2026-08-21T10:00:00.000Z');

function feature(fields: Partial<Feature> = {}): Feature {
	return { id: 'feature-1', status: 'backlog', title: 'One', ...fields } as Feature;
}

async function project(status: string): Promise<string> {
	const projectDir = await testTempDir('aidd-completed-at-');
	const path = join(projectDir, '.aidd', 'features', 'feature-1', 'feature.json');
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		`${JSON.stringify({ description: 'work', id: 'feature-1', status, title: 'One' }, null, '\t')}\n`,
	);
	return projectDir;
}

async function readStored(projectDir: string): Promise<Record<string, unknown>> {
	const raw = await readFile(
		join(projectDir, '.aidd', 'features', 'feature-1', 'feature.json'),
		'utf8',
	);
	return JSON.parse(raw) as Record<string, unknown>;
}

describe('applyCompletionTimestamp', () => {
	test('stamps the instant a feature enters completed', () => {
		const stamped = applyCompletionTimestamp(feature({ status: 'completed' }), AT);
		expect(stamped.completedAt).toBe('2026-08-21T10:00:00.000Z');
	});

	// Milestone edits, priority sync and roadmap assignment all flow back through writeFeature, so
	// a non-idempotent stamp would re-date every completed feature on every routine metadata write.
	test('leaves an already-stamped completion alone', () => {
		const original = feature({ completedAt: '2026-01-01T00:00:00.000Z', status: 'completed' });
		expect(applyCompletionTimestamp(original, AT)).toBe(original);
	});

	test('clears the stamp when the feature is reopened, and re-stamps on re-completion', () => {
		const reopened = applyCompletionTimestamp(
			feature({ completedAt: '2026-01-01T00:00:00.000Z', status: 'in_progress' }),
			AT,
		);
		expect(reopened.completedAt).toBeUndefined();
		expect(applyCompletionTimestamp({ ...reopened, status: 'completed' }, AT).completedAt).toBe(
			'2026-08-21T10:00:00.000Z',
		);
	});

	// `status` is optional on the schema and partial writers exist; an absent status is not a
	// statement that the feature is open, so it must not delete a real completion instant.
	test('does not clear the stamp when the record carries no status at all', () => {
		const partial = { completedAt: '2026-01-01T00:00:00.000Z', id: 'feature-1' } as Feature;
		expect(applyCompletionTimestamp(partial, AT).completedAt).toBe('2026-01-01T00:00:00.000Z');
	});

	test('leaves an open feature with no stamp untouched', () => {
		const open = feature({ status: 'in_progress' });
		expect(applyCompletionTimestamp(open, AT)).toBe(open);
	});
});

describe('writeFeature', () => {
	test('is the choke point — every completion written through the store is dated', async () => {
		const projectDir = await project('in_progress');
		const store = new FileAiddStore(projectDir);
		const before = await store.readFeature('feature-1');
		await store.writeFeature({ ...before, passes: true, status: 'completed' });

		const stored = await readStored(projectDir);
		expect(typeof stored.completedAt).toBe('string');
		expect(Number.isNaN(Date.parse(stored.completedAt as string))).toBe(false);
	});

	test('reopening a completed feature through the store drops the date', async () => {
		const projectDir = await project('completed');
		const store = new FileAiddStore(projectDir);
		await store.writeFeature(await store.readFeature('feature-1'));
		expect(typeof (await readStored(projectDir)).completedAt).toBe('string');

		const completed = await store.readFeature('feature-1');
		await store.writeFeature({ ...completed, passes: false, status: 'in_progress' });
		expect((await readStored(projectDir)).completedAt).toBeUndefined();
	});

	test('records one remediated event when a fingerprinted finding completes', async () => {
		const projectDir = await project('in_progress');
		const store = new FileAiddStore(projectDir);
		const before = await store.readFeature('feature-1');
		const completed = {
			...before,
			auditSource: 'SECURITY',
			fingerprint: `f1-${'b'.repeat(64)}`,
			passes: true,
			status: 'completed',
		};
		await store.writeFeature(completed);
		await store.writeFeature(await store.readFeature('feature-1'));

		const events = await store.readFindingEvents();
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			auditSource: 'SECURITY',
			event: 'remediated',
			featureId: 'feature-1',
			fingerprint: `f1-${'b'.repeat(64)}`,
			source: 'feature-completion',
		});
		expect(events[0] && 'runId' in events[0]).toBe(false);
	});

	test('emits remediated once across reopen and re-complete cycles', async () => {
		const projectDir = await project('in_progress');
		const store = new FileAiddStore(projectDir);
		const base = {
			...(await store.readFeature('feature-1')),
			auditSource: 'SECURITY',
			fingerprint: `f1-${'c'.repeat(64)}`,
		};
		await store.writeFeature({ ...base, passes: true, status: 'completed' });
		await store.writeFeature({ ...base, passes: false, status: 'in_progress' });
		await store.writeFeature({ ...base, passes: true, status: 'completed' });

		const events = await store.readFindingEvents();
		expect(events.map((event) => event.event)).toEqual(['remediated']);
	});

	test('leaves feature.json untouched when the remediation append fails', async () => {
		const projectDir = await project('in_progress');
		const store = new FileAiddStore(projectDir);
		// A directory where the ledger file belongs makes the append fail.
		await mkdir(join(projectDir, '.aidd', 'findings-ledger.jsonl'), { recursive: true });
		const before = await readStored(projectDir);

		await expect(
			store.writeFeature({
				...(await store.readFeature('feature-1')),
				auditSource: 'SECURITY',
				fingerprint: `f1-${'d'.repeat(64)}`,
				passes: true,
				status: 'completed',
			}),
		).rejects.toBeInstanceOf(Error);

		expect(await readStored(projectDir)).toEqual(before);
	});
});
