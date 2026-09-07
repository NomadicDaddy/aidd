import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, spyOn, test } from 'bun:test';
import { sha256Set, sha256Text } from 'aidd-shared/content-hash';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	externalRunDriver,
	promptRunDriver,
	runDriverForPlan,
	setAuditRunDriver,
} from '../../cli/src/run-driver.ts';
import { runRuntimeFields } from '../../cli/src/orchestrator/run/types.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

describe('run driver provenance', () => {
	test('captures custom prompts and accepts externally supplied drivers', () => {
		expect(promptRunDriver('Inspect the selected feature.')).toEqual({
			driverId: null,
			driverKind: 'prompt',
			driverSha256: sha256Text('Inspect the selected feature.'),
		});
		expect(
			externalRunDriver({
				AIDD_EXT_RUN_DRIVER_ID: 'step-review',
				AIDD_EXT_RUN_DRIVER_KIND: 'recipe-step',
				AIDD_EXT_RUN_DRIVER_SHA256: 'a'.repeat(64),
			}),
		).toEqual({
			driverId: 'step-review',
			driverKind: 'recipe-step',
			driverSha256: 'a'.repeat(64),
		});
	});

	test('an unparseable external driver is logged and dropped instead of aborting the run', () => {
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			expect(externalRunDriver({ AIDD_EXT_RUN_DRIVER_KIND: 'recipe' })).toBeUndefined();
			expect(warn).toHaveBeenCalledTimes(1);
			expect(String(warn.mock.calls[0]?.[0])).toContain(
				'Ignoring unparseable external run driver provenance',
			);
		} finally {
			warn.mockRestore();
		}
	});

	test('empty environment values read as absent', () => {
		expect(
			externalRunDriver({
				AIDD_EXT_RUN_DRIVER_ID: '',
				AIDD_EXT_RUN_DRIVER_KIND: '',
				AIDD_EXT_RUN_DRIVER_SHA256: '',
			}),
		).toBeUndefined();
		expect(
			externalRunDriver({ AIDD_EXT_RUN_DRIVER_ID: '', AIDD_EXT_RUN_DRIVER_KIND: 'prompt' }),
		).toEqual({ driverId: null, driverKind: 'prompt', driverSha256: null });
	});

	test('a skill driver outranks the external driver, which outranks the prompt', () => {
		const plan = { prompt: { customDirective: 'Do it.' } } as RunPlan;
		const env = {
			AIDD_EXT_RUN_DRIVER_ID: 'step-review',
			AIDD_EXT_RUN_DRIVER_KIND: 'recipe-step',
			AIDD_EXT_RUN_DRIVER_SHA256: 'a'.repeat(64),
		};
		const skill = {
			driverId: 'review',
			driverKind: 'skill' as const,
			driverSha256: 'b'.repeat(64),
		};
		expect(runDriverForPlan(plan, skill, env)).toEqual(skill);
		expect(runDriverForPlan(plan, undefined, env)).toMatchObject({ driverKind: 'recipe-step' });
		expect(runDriverForPlan(plan, undefined, {})).toEqual(promptRunDriver('Do it.'));
		expect(runDriverForPlan({ prompt: {} } as RunPlan, undefined, {})).toBeUndefined();
	});

	test('sorts batch audit names by code point and hashes the set of definition hashes', async () => {
		const rootDir = await testTempDir('aidd-run-driver-audit-');
		const plan = {} as RunPlan;
		try {
			await mkdir(join(rootDir, 'audits'), { recursive: true });
			await Bun.write(join(rootDir, 'audits', 'alpha.md'), '# Alpha\n');
			await Bun.write(join(rootDir, 'audits', 'ZETA.md'), '# Zeta\n');

			await setAuditRunDriver(plan, rootDir, ['alpha', 'ZETA']);

			// localeCompare would put alpha first; code point order puts the upper-case name first.
			expect(plan.driver).toEqual({
				driverId: 'ZETA+alpha',
				driverKind: 'audit',
				driverSha256: sha256Set([
					{ id: 'ZETA', sha256: sha256Text('# Zeta\n') },
					{ id: 'alpha', sha256: sha256Text('# Alpha\n') },
				]),
			});
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('a single audit records its own definition hash, newline-normalized', async () => {
		const rootDir = await testTempDir('aidd-run-driver-single-');
		const plan = {} as RunPlan;
		try {
			await mkdir(join(rootDir, 'audits'), { recursive: true });
			await Bun.write(join(rootDir, 'audits', 'ALPHA.md'), '# Alpha\r\n\r\nCheck it.\r\n');

			await setAuditRunDriver(plan, rootDir, ['ALPHA']);

			expect(plan.driver).toEqual({
				driverId: 'ALPHA',
				driverKind: 'audit',
				driverSha256: sha256Text('# Alpha\n\nCheck it.\n'),
			});
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('a missing audit definition records a null hash with a warning and keeps the run going', async () => {
		const rootDir = await testTempDir('aidd-run-driver-missing-');
		const plan = {} as RunPlan;
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await mkdir(join(rootDir, 'audits'), { recursive: true });
			await Bun.write(join(rootDir, 'audits', 'ALPHA.md'), '# Alpha\n');

			await setAuditRunDriver(plan, rootDir, ['MISSING', 'ALPHA']);

			expect(plan.driver).toEqual({
				driverId: 'ALPHA+MISSING',
				driverKind: 'audit',
				driverSha256: null,
			});
			expect(warn).toHaveBeenCalledTimes(1);
			expect(String(warn.mock.calls[0]?.[0])).toContain('MISSING');
		} finally {
			warn.mockRestore();
			await removeTempTree(rootDir);
		}
	});

	test('includes nullable driver fields in every ledger runtime field set', () => {
		const basePlan = {
			backend: 'native',
			mode: 'coding',
			prompt: { phase: 'coding' },
			reasoningEffort: 'medium',
		} as RunPlan;
		expect(runRuntimeFields(basePlan)).toMatchObject({
			driverId: null,
			driverKind: null,
			driverSha256: null,
		});
		basePlan.driver = promptRunDriver('Build it.');
		expect(runRuntimeFields(basePlan)).toMatchObject(basePlan.driver);
	});
});
