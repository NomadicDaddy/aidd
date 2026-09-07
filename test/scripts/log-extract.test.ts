import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	extractAllIterations,
	extractLatestIteration,
} from '../../cli/src/metadata/log-extract.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function setupProjectWithIterations(records: Record<string, unknown>[]): Promise<string> {
	const projectDir = await testTempDir('aidd-extract-');
	const iterationsDir = join(projectDir, '.aidd', 'iterations');
	await mkdir(iterationsDir, { recursive: true });
	for (let i = 0; i < records.length; i++) {
		const stem = String(i + 1).padStart(3, '0');
		await writeFile(
			join(iterationsDir, `${stem}.json`),
			`${JSON.stringify(records[i], null, 2)}\n`,
		);
	}
	return projectDir;
}

describe('log-extract', () => {
	test('extractLatestIteration returns last iteration reshaped', async () => {
		const projectDir = await setupProjectWithIterations([
			{ iteration: 0, exitCode: 0, filesRead: ['a.ts'] },
			{
				iteration: 1,
				exitCode: 0,
				backend: 'native',
				filesEdited: ['b.ts'],
				detailsSummary: { totalToolCalls: 4, uniqueFilesEdited: 1 },
				unexpectedField: 'ignored',
			},
		]);
		const latest = await extractLatestIteration(projectDir);
		expect(latest?.iteration).toBe(1);
		expect(latest?.backend).toBe('native');
		expect(latest?.filesEdited).toEqual(['b.ts']);
		expect(latest?.summary).toEqual({ totalToolCalls: 4, uniqueFilesEdited: 1 });
		expect(latest).not.toHaveProperty('unexpectedField');
	});

	test('extractAllIterations returns sorted records', async () => {
		const projectDir = await setupProjectWithIterations([
			{ iteration: 0, exitCode: 0 },
			{ iteration: 1, exitCode: 0 },
			{ iteration: 2, exitCode: 1 },
		]);
		const all = await extractAllIterations(projectDir);
		expect(all).toHaveLength(3);
		expect(all.map((entry) => entry.iteration)).toEqual([0, 1, 2]);
	});

	test('returns undefined / empty when project has no iterations', async () => {
		const projectDir = await testTempDir('aidd-extract-empty-');
		expect(await extractLatestIteration(projectDir)).toBeUndefined();
		expect(await extractAllIterations(projectDir)).toEqual([]);
	});
});
