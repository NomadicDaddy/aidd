import { describe, expect, test } from 'bun:test';

import { isKnownSmokeCacheStep } from '../../scripts/lib/smoke-cache/dependencies.ts';
import { assertSmokeCacheCoverage } from '../../scripts/lib/smoke-qc/coverage.ts';
import {
	FAST_QC_STEP_NAMES,
	FAST_QC_STEPS,
	parseSmokeQcArgs,
	SMOKE_QC_STEPS,
} from '../../scripts/smoke-qc.ts';

describe('smoke:qc --fast subset', () => {
	test('--fast flag parses', () => {
		expect(parseSmokeQcArgs(['--fast']).fast).toBe(true);
		expect(parseSmokeQcArgs([]).fast).toBe(false);
	});

	test('strict parsing rejects mistyped fast flags', () => {
		expect(() => parseSmokeQcArgs(['--fasst'])).toThrow("Unknown option '--fasst'");
	});

	test('omits the slow steps so it stays inner-loop cheap', () => {
		// The whole point of the fast gate is to skip the build and the test suite — the two
		// steps that make a full smoke:qc slow enough to blow an external CLI's command timeout.
		expect(FAST_QC_STEP_NAMES).not.toContain('test');
		expect(FAST_QC_STEP_NAMES).not.toContain('build:frontend');
	});

	test('every fast step is a real smoke:qc step, in the declared order', () => {
		expect(FAST_QC_STEPS.map((step) => step.name)).toEqual([...FAST_QC_STEP_NAMES]);
		const allNames = new Set(SMOKE_QC_STEPS.map((step) => step.name));
		for (const name of FAST_QC_STEP_NAMES) {
			expect(allNames.has(name)).toBe(true);
		}
	});

	test('covers the code-quality checks the fix loop iterates on', () => {
		// Types + lint are the errors an implementation loop actually chases; max-lines and
		// format guard the two other cheap gates that otherwise only surface in the full run.
		expect(FAST_QC_STEP_NAMES).toContain('typecheck');
		expect(FAST_QC_STEP_NAMES).toContain('lint');
		expect(FAST_QC_STEP_NAMES).toContain('check:max-lines');
		expect(FAST_QC_STEP_NAMES).toContain('format:check');
	});

	test('classifies every smoke step as cacheable or intentionally uncacheable', () => {
		for (const step of SMOKE_QC_STEPS) {
			expect(isKnownSmokeCacheStep(step.name)).toBe(true);
		}
	});

	test('runs cheapest-first so a doomed tree fails fast', () => {
		// The full order is measured (see scripts/lib/smoke-qc/fast-subset.ts); the two ends are
		// the load-bearing part. check:max-lines is ~70x cheaper than lint, so surfacing a lint
		// error first spends ~10s reporting what a 0.14s gate could have caught. Asserting the
		// whole array here would just restate the constant and pin nothing.
		expect(FAST_QC_STEP_NAMES[0]).toBe('check:max-lines');
		expect(FAST_QC_STEP_NAMES.at(-1)).toBe('lint');
	});

	test('refuses to run a step with no cache classification', () => {
		expect(() => assertSmokeCacheCoverage(['check:brand-new'])).toThrow(
			'need cache classifications',
		);
		expect(() =>
			assertSmokeCacheCoverage(SMOKE_QC_STEPS.map((step) => step.name)),
		).not.toThrow();
	});
});
