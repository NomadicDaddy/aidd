import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FileAiddStore } from 'aidd-shared/metadata/store';

import {
	appendInvalidFeatureMetadata,
	auditFeatureScope,
	captureFeatureCompletionSnapshot,
} from '../../cli/src/orchestrator/run/feature-scope.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function makeStore(name: string): Promise<{ projectDir: string; store: FileAiddStore }> {
	const root = await testTempDir(`feature-scope-invalid-${name}`);
	const projectDir = join(root, name);
	await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
	return { projectDir, store: new FileAiddStore(projectDir) };
}

async function corrupt(projectDir: string, directory: string): Promise<void> {
	const dir = join(projectDir, '.aidd', 'features', directory);
	await mkdir(dir, { recursive: true });
	// A literal newline inside a JSON string value — exactly what an agent produces when it
	// text-edits feature.json and writes a real line break instead of the two characters `\n`.
	await writeFile(
		join(dir, 'feature.json'),
		'{"id":"broken","status":"backlog","passes":false,"notes":"line one\nline two"}',
	);
}

const work = { description: 'Selected', id: 'feature-selected', kind: 'feature' as const };

describe('unreadable feature metadata', () => {
	test('listFeatureReadFailures names records listFeatures silently drops', async () => {
		const { projectDir, store } = await makeStore('listed');
		await store.writeFeature({ id: 'feature-selected', passes: false, status: 'backlog' });
		await corrupt(projectDir, 'feature-broken');

		expect((await store.listFeatures({ includeAudit: true })).map((f) => f.id)).toEqual([
			'feature-selected',
		]);
		const failures = await store.listFeatureReadFailures();
		expect(failures.map((failure) => failure.directory)).toEqual(['feature-broken']);
		expect(failures[0]?.message).toBeTruthy();
	});

	// The run this guards against: iteration N corrupts a feature that was already completed days
	// earlier, iteration N+1 repairs it, and the repair looked identical to completing an
	// out-of-scope feature — so a successful iteration ended the whole run as a scope overrun.
	test('repairing a record that was unreadable at iteration start is not a scope overrun', async () => {
		const { projectDir, store } = await makeStore('repair');
		await store.writeFeature({ id: 'feature-selected', passes: false, status: 'backlog' });
		await corrupt(projectDir, 'feature-broken');

		const before = await captureFeatureCompletionSnapshot(store);
		expect(before.unreadable.map((failure) => failure.directory)).toEqual(['feature-broken']);

		// The agent repairs the corrupted record, restoring its completed status.
		await store.writeFeature({ id: 'feature-broken', passes: true, status: 'completed' });

		const audit = await auditFeatureScope(store, work, before, undefined);
		expect(audit.scopeOverrun).toBe(false);
		expect(audit.extraCompletedFeatures).toEqual([]);
		expect(audit.invalidFeatureMetadata).toEqual([]);
	});

	test('a feature genuinely completed out of scope is still a scope overrun', async () => {
		const { store } = await makeStore('overrun');
		await store.writeFeature({ id: 'feature-selected', passes: false, status: 'backlog' });
		await store.writeFeature({ id: 'feature-other', passes: false, status: 'backlog' });

		const before = await captureFeatureCompletionSnapshot(store);
		await store.writeFeature({ id: 'feature-other', passes: true, status: 'completed' });

		const audit = await auditFeatureScope(store, work, before, undefined);
		expect(audit.scopeOverrun).toBe(true);
		expect(audit.extraCompletedFeatures).toEqual(['feature-other']);
	});

	test('an unrepaired record is reported in the audit and named in the summary', async () => {
		const { projectDir, store } = await makeStore('reported');
		await store.writeFeature({ id: 'feature-selected', passes: false, status: 'backlog' });
		await corrupt(projectDir, 'feature-broken');

		const before = await captureFeatureCompletionSnapshot(store);
		const audit = await auditFeatureScope(store, work, before, undefined);
		expect(audit.invalidFeatureMetadata.map((failure) => failure.directory)).toEqual([
			'feature-broken',
		]);
		expect(appendInvalidFeatureMetadata('exit 0', audit.invalidFeatureMetadata)).toContain(
			'invalid_feature_metadata: unreadable feature.json for feature-broken',
		);
	});

	test('a summary with no failures is returned unchanged', () => {
		expect(appendInvalidFeatureMetadata('exit 0', [])).toBe('exit 0');
	});
});
