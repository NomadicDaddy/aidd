import { afterEach, describe, expect, test } from 'bun:test';

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	ALL_TARGETS,
	getRequiredDistributionEntries,
	resolveTargetOutDir,
} from '../../scripts/build-standalone.ts';
import {
	canProbeTarget,
	checkStandaloneDistributions,
	formatStandaloneCheckResults,
	hasStandaloneCheckFailure,
	parseCheckStandaloneArgs,
} from '../../scripts/check-standalone.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
const tmpRoots: string[] = [];

function windowsTarget() {
	const target = ALL_TARGETS.find((item) => item.name === 'bun-windows-x64-modern');
	if (!target) throw new Error('Missing Windows standalone target');
	return target;
}

async function makeRoot(): Promise<string> {
	const root = await testTempDir('aidd-standalone-check-');
	tmpRoots.push(root);
	return root;
}

async function seedDistributionLayout(root: string): Promise<void> {
	const target = windowsTarget();
	const outDir = resolveTargetOutDir(root, target);
	for (const entry of getRequiredDistributionEntries(target)) {
		const fullPath = join(outDir, entry.path);
		if (entry.kind === 'directory') {
			await mkdir(fullPath, { recursive: true });
		} else {
			await mkdir(dirname(fullPath), { recursive: true });
			await writeFile(fullPath, entry.path);
		}
	}
}

afterEach(async () => {
	for (const root of tmpRoots.splice(0)) {
		await removeTempTree(root);
	}
});

describe('standalone distribution checker', () => {
	test('parses target and binary probe options', () => {
		const args = parseCheckStandaloneArgs([
			'--target',
			'bun-windows-x64-modern',
			'--probe-binaries',
		]);

		expect(args.probeBinaries).toBe(true);
		expect(args.targets.map((target) => target.name)).toEqual(['bun-windows-x64-modern']);
	});

	test('defaults to all targets when no target is supplied', () => {
		const args = parseCheckStandaloneArgs([]);
		expect(args.targets.map((target) => target.name)).toEqual(
			ALL_TARGETS.map((target) => target.name),
		);
	});

	test('detects locally executable target platforms', () => {
		expect(canProbeTarget(windowsTarget(), 'win32', 'x64')).toBe(true);
		expect(canProbeTarget(windowsTarget(), 'linux', 'x64')).toBe(false);
	});

	test('reports missing target layout as a checker failure', async () => {
		const root = await makeRoot();
		const results = await checkStandaloneDistributions(root, {
			probeBinaries: false,
			targets: [windowsTarget()],
		});

		expect(hasStandaloneCheckFailure(results)).toBe(true);
		expect(results[0]?.layoutIssues).toContain('missing file: aidd.exe');
		expect(formatStandaloneCheckResults(results)).toContain('[FAIL] bun-windows-x64-modern');
	});

	test('passes complete layout and skips probes when disabled', async () => {
		const root = await makeRoot();
		await seedDistributionLayout(root);

		const results = await checkStandaloneDistributions(root, {
			probeBinaries: false,
			targets: [windowsTarget()],
		});

		expect(hasStandaloneCheckFailure(results)).toBe(false);
		expect(results[0]?.layoutIssues).toEqual([]);
		expect(results[0]?.probeResults).toEqual([]);
	});

	test('skips probes when layout validation fails', async () => {
		const root = await makeRoot();
		const results = await checkStandaloneDistributions(root, {
			probeBinaries: true,
			targets: [windowsTarget()],
		});

		expect(results[0]?.probeSkippedReason).toBe('layout validation failed');
		expect(results[0]?.probeResults).toEqual([]);
	});
});
