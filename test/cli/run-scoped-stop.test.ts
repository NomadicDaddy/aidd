import { expect, test } from 'bun:test';
import { createCliActiveRunRecord } from 'aidd-shared/metadata/active-runs';
import { runStopFilePath, stopFilePath } from 'aidd-shared/metadata/paths';

import { hasStopRequested } from '../../cli/src/orchestrator/run/stop-request.ts';

function storeWith(...requested: string[]) {
	const paths = new Set(requested);
	return { hasStopRequested: async (path: string) => paths.has(path) };
}

const projectDir = 'D:/applications/example';
const runA = runStopFilePath(projectDir, 'run_a');
const runB = runStopFilePath(projectDir, 'run_b');
const projectStop = stopFilePath(projectDir);

test('a run-specific stop signal does not stop its sibling', async () => {
	expect(
		await hasStopRequested(storeWith(runA), {
			projectStopFile: projectStop,
			stopFile: runA,
		}),
	).toBe(true);
	expect(
		await hasStopRequested(storeWith(runA), {
			projectStopFile: projectStop,
			stopFile: runB,
		}),
	).toBe(false);
});

test('the explicit project stop signal still stops both runs', async () => {
	for (const stopFile of [runA, runB]) {
		expect(
			await hasStopRequested(storeWith(projectStop), {
				projectStopFile: projectStop,
				stopFile,
			}),
		).toBe(true);
	}
});

test('active-run records publish the run-specific stop file', () => {
	const record = createCliActiveRunRecord({
		backend: 'native',
		id: 'run_a',
		mode: 'coding',
		model: undefined,
		projectDir,
		provider: undefined,
		reasoningEffort: 'medium',
	});
	expect(record.stopFile).toBe(runA);
});
