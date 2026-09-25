import { describe, expect, test } from 'bun:test';
import path from 'node:path';

import type { BenchmarkRun } from '../../scripts/lib/benchmark/types.ts';

import { loadManifest } from '../../scripts/lib/benchmark/manifest.ts';
import { regradeRuns } from '../../scripts/lib/benchmark/results.ts';
import { orchestratorExitCodes } from '../../shared/src/orchestrator/result.ts';

const repoRoot = path.join(import.meta.dir, '..', '..');
const manifest = loadManifest(
	path.join(repoRoot, 'test', 'fixtures', 'benchmark', 'manifest.simulation.json'),
);

// A run whose workspace no longer exists: the common case for the old quota deaths this exists for.
function goneRun(overrides: Partial<BenchmarkRun>): BenchmarkRun {
	return {
		artifactPaths: {
			auditReports: [],
			rawLogs: [],
			responses: [],
			runsLedger: [],
			structuredLogs: [],
			workspace: path.join(repoRoot, 'no-such-workspace-for-regrade-test'),
		},
		command: ['bun'],
		correctnessScore: 0,
		costUsd: null,
		durationSeconds: 3,
		fixtureHash: 'fixture',
		iterations: 1,
		notes: [],
		replicate: 0,
		stack: manifest.stacks[0]!,
		status: 'failure',
		taskId: manifest.tasks[0]!.id,
		tokenUsage: {
			cachedTokens: 0,
			inputTokens: 0,
			known: false,
			outputTokens: 0,
			reasoningTokens: 0,
		},
		workspaceHash: 'workspace',
		...overrides,
	};
}

describe('regrade reclassifies provider refusals from the saved exit code', () => {
	test('a failure that exited rate-limited becomes provider_unavailable, workspace or not', () => {
		const result = regradeRuns(manifest, [
			goneRun({ exitCode: orchestratorExitCodes.rateLimited }),
			goneRun({ exitCode: orchestratorExitCodes.providerError }),
		]);
		expect(result.runs.map((run) => run.status)).toEqual([
			'provider_unavailable',
			'provider_unavailable',
		]);
		expect(result.changed).toBe(2);
	});

	test('an ordinary failure, or a record from before exit codes were saved, is left alone', () => {
		const result = regradeRuns(manifest, [
			goneRun({ exitCode: 1 }),
			goneRun({}),
			goneRun({ exitCode: orchestratorExitCodes.rateLimited, status: 'timeout' }),
		]);
		expect(result.runs.map((run) => run.status)).toEqual(['failure', 'failure', 'timeout']);
		expect(result.changed).toBe(0);
	});
});
