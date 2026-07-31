import { describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import type { ResolvedConfig } from 'aidd-shared/config';
import { backendNames } from 'aidd-shared/plan/types';

import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { snapshotBackends, snapshotModes } from '../../cli/src/prompts/snapshot-matrix.ts';

const rootDir = join(import.meta.dir, '..', '..');

const config: ResolvedConfig = {
	cli: 'native',
	reasoningEffort: 'low',
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	timeoutSeconds: 3600,
	preflightDoctor: false,
	idleTimeoutSeconds: 900,
	idleNudgeTimeoutSeconds: 600,
	dirtyTreeThreshold: 50,
	noWorkBackoffMs: 30_000,
	noClean: false,
	quitOnAbort: 0,
	rateLimitBufferSeconds: 60,
	rateLimitBackoffSeconds: 300,
};

// The snapshot matrix is the reviewable record of what agents are told, so gaps in it are
// silent: a backend or phase missing from the matrix compiles fine and never shows up in
// the drift gate (this is exactly how openai shipped without a backend fragment and
// in-progress shipped with no snapshots at all). These tests make the matrix's coverage a
// checked property instead of a review convention.
describe('snapshot matrix completeness', () => {
	test('every backend is snapshotted or provably native-routed', () => {
		const snapshotted = new Set<string>(snapshotBackends);
		expect(snapshotted.has('native')).toBe(true);
		for (const backend of backendNames) {
			if (snapshotted.has(backend)) continue;
			const plan = resolveRunPlan(parseArgs(['--project-dir', '.', '--cli', backend]), {
				...config,
				cli: backend,
			});
			const fragment = plan.prompt.fragments.find((entry) => entry.kind === 'backend');
			// A native-routed backend compiles byte-identically to the native snapshots, so
			// omitting it loses nothing. Anything else must join snapshotBackends.
			expect(`${backend}: ${fragment?.path}`).toBe(`${backend}: prompts/_cli/native.md`);
		}
	});

	test('every prompts/*.md phase file has a snapshot matrix entry', async () => {
		const phaseFiles = (await readdir(join(rootDir, 'prompts'), { withFileTypes: true }))
			.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
			.map((entry) => entry.name.replace(/\.md$/, ''));
		expect(phaseFiles.length).toBeGreaterThan(0);

		const coveredPhases = new Set<string>();
		for (const mode of snapshotModes) {
			if (mode.phase) {
				coveredPhases.add(mode.phase);
				continue;
			}
			const plan = resolveRunPlan(parseArgs(['--project-dir', '.', ...mode.args]), config);
			coveredPhases.add(plan.prompt.phase);
		}

		for (const phase of phaseFiles) {
			expect(`${phase}: ${coveredPhases.has(phase)}`).toBe(`${phase}: true`);
		}
	});
});
