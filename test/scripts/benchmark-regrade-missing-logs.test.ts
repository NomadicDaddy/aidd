import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { BenchmarkManifest, BenchmarkRun } from '../../scripts/lib/benchmark/types.ts';

import { loadManifest } from '../../scripts/lib/benchmark/manifest.ts';
import { backupRunsBeforeRegrade, regradeRuns } from '../../scripts/lib/benchmark/results.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

// Regrade re-measured any run whose workspace still existed. With the iteration logs gone it read
// zero tokens, zero iterations and zero cost and wrote them over the recorded run; with logs that
// never noted the exit it read 'unknown' as success. results/ is gitignored, so nothing kept the
// ledger it overwrote.

const repoRoot = path.join(import.meta.dir, '..', '..');
const fixtureManifest = loadManifest(
	path.join(repoRoot, 'test', 'fixtures', 'benchmark', 'manifest.simulation.json'),
);
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

async function workspace(files: Record<string, string> = {}): Promise<string> {
	const root = await testTempDir('aidd-benchmark-regrade-');
	roots.push(root);
	await writeFile(path.join(root, 'README.md'), '# workspace\n');
	for (const [file, content] of Object.entries(files)) {
		await mkdir(path.dirname(path.join(root, file)), { recursive: true });
		await writeFile(path.join(root, file), content);
	}
	return root;
}

function run(
	manifest: BenchmarkManifest,
	workspaceDir: string,
	overrides: Partial<BenchmarkRun>,
): BenchmarkRun {
	return {
		artifactPaths: {
			auditReports: [],
			rawLogs: [],
			responses: [],
			runsLedger: [],
			structuredLogs: [],
			workspace: workspaceDir,
		},
		command: ['bun'],
		correctnessScore: 1,
		costUsd: null,
		durationSeconds: 30,
		fixtureHash: 'fixture',
		iterations: 3,
		notes: [],
		replicate: 0,
		stack: manifest.stacks[0]!,
		status: 'success',
		taskId: manifest.tasks[0]!.id,
		tokenUsage: {
			cachedTokens: 0,
			inputTokens: 12_000,
			known: true,
			outputTokens: 3_000,
			reasoningTokens: 0,
		},
		workspaceHash: 'workspace',
		...overrides,
	};
}

describe('regrade keeps what it cannot re-measure', () => {
	test('a workspace without its iteration logs keeps the recorded metrics', async () => {
		const recorded = run(fixtureManifest, await workspace(), {});

		const [regraded] = regradeRuns(fixtureManifest, [recorded]).runs;

		expect(regraded?.tokenUsage).toEqual(recorded.tokenUsage);
		expect(regraded?.iterations).toBe(3);
		expect(regraded?.correctnessScore).toBe(1);
	});

	test('an exit the logs never recorded is taken from the run record', async () => {
		const manifest: BenchmarkManifest = {
			...fixtureManifest,
			tasks: [
				{
					category: 'control',
					command: 'check',
					fixture: 'fixture',
					id: 'control-check',
					timeoutSeconds: 60,
				},
			],
		};
		const workspaceDir = await workspace({ '.aidd/iterations/001.log': 'checked\n' });
		const recorded = run(manifest, workspaceDir, {
			correctnessScore: 0,
			exitCode: 1,
			status: 'failure',
			taskId: 'control-check',
		});

		const [regraded] = regradeRuns(manifest, [recorded]).runs;

		expect(regraded?.correctnessScore).toBe(0);
	});

	test('the ledger a regrade rewrites is kept beside it', async () => {
		const root = await workspace();
		const runsPath = path.join(root, 'runs.jsonl');
		await writeFile(runsPath, '{"recorded":true}\n');

		backupRunsBeforeRegrade(runsPath);

		expect(await readFile(`${runsPath}.pre-regrade`, 'utf8')).toBe('{"recorded":true}\n');
	});
});
