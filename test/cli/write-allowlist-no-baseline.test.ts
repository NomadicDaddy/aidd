import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FileAiddStore } from 'aidd-shared/metadata/store';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { captureStdout, FakeBackend, plan, rootDir } from './_helpers/orchestrator-fixture.ts';

// --write-allowlist with no git baseline printed one console.warn and ran the iteration
// unguarded: a guard the operator asked for failed open, and nothing in the summary or the exit
// code said so. The fixture lives in the system temp directory on purpose: a directory nested
// inside the aidd checkout would snapshot the checkout instead of reading as unguardable.
describe('write allowlist with no baseline', () => {
	let projectDir = '';

	afterEach(async () => {
		if (projectDir) await removeTempTree(projectDir);
	});

	test('refuses to run unguarded: no backend starts and the run exits with the violation code', async () => {
		projectDir = await testTempDir('aidd-write-allowlist-no-baseline-');
		await mkdir(join(projectDir, '.aidd', 'features', 'feature-core'), { recursive: true });
		await writeFile(
			join(projectDir, '.aidd', 'features', 'feature-core', 'feature.json'),
			JSON.stringify({
				id: 'feature-core',
				passes: false,
				priority: 1,
				status: 'backlog',
				title: 'Core feature',
			}),
		);
		const store = new FileAiddStore(projectDir);
		const backend = new FakeBackend([{ exitCode: 0, filesModified: [], type: 'done' }]);

		let exitCode = -1;
		await captureStdout(async () => {
			exitCode = await runOrchestrator(plan(projectDir, ['--write-allowlist', '.aidd']), {
				backend,
				rootDir,
				store,
			});
		});

		expect(exitCode).toBe(orchestratorExitCodes.writeAllowlistViolation);
		expect(backend.calls).toBe(0);
		const [runSummary] = (await readFile(join(projectDir, '.aidd', 'runs.jsonl'), 'utf8'))
			.trim()
			.split(/\r?\n/)
			.map((line) => JSON.parse(line) as { summary: string });
		expect(runSummary?.summary).toContain('refusing to run unguarded');
	});
});
