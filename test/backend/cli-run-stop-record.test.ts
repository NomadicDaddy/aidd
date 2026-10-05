import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';

import { requestCliRunStop } from '../../backend/src/services/run/cliActiveRuns.ts';
import {
	createCliActiveRunRecord,
	readCliActiveRunRecords,
	writeCliActiveRunRecord,
} from '../../shared/src/metadata/active-runs.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// The CLI owns its active-run record and rewrites it from memory every few seconds. Stop used to
// rewrite it too, from the snapshot it had just read, so a record the CLI wrote in between was lost:
// a run that had just finished went back to a live-looking stop_requested with a fresh heartbeat,
// and the CLI, already gone, never corrected it.

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

test('a stop never overwrites the record the CLI wrote after the snapshot', async () => {
	const projectPath = await testTempDir('aidd-cli-stop-');
	roots.push(projectPath);
	const snapshot = {
		...createCliActiveRunRecord({
			backend: 'codex',
			id: 'cli_stop_race',
			mode: 'coding',
			model: undefined,
			projectDir: projectPath,
			provider: undefined,
			reasoningEffort: 'low',
			source: 'cli',
		}),
		heartbeatAt: Date.now(),
		pid: process.pid,
		state: 'running',
	};
	await writeCliActiveRunRecord(snapshot);
	// The CLI finishes between the backend's read and its stop.
	await writeCliActiveRunRecord({
		...snapshot,
		completedAt: Date.now(),
		exitCode: 0,
		state: 'completed',
		summary: 'finished',
	});
	const broadcasts: unknown[] = [];
	const ctx = { config: {}, hub: { broadcast: (event: unknown) => broadcasts.push(event) } };

	await requestCliRunStop(ctx as unknown as Parameters<typeof requestCliRunStop>[0], snapshot);

	const [record] = await readCliActiveRunRecords(projectPath, { includeCompleted: true });
	expect(record?.state).toBe('completed');
	expect(record?.summary).toBe('finished');
	expect(existsSync(snapshot.stopFile)).toBe(true);
	expect(broadcasts).toHaveLength(1);
});
