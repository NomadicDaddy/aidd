import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { eslintArgs, parseReport, recordBaseline } from '../../scripts/check-function-size.ts';
import { STEP_DEPENDENCIES } from '../../scripts/lib/smoke-cache/dependencies.ts';
import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';
import { testTempDir } from '../_helpers/temp.ts';

// The function-size ratchet's reading of ESLint's report. Ordinary rule messages become offenders
// with their measure; a report that did not measure a file is refused, because reading it as a
// lower count would offer to lower the baseline on a file nobody parsed.

const ROOT = 'D:\\repo';
const file = (name: string, messages: object[]): object => ({
	filePath: `${ROOT}\\backend\\src\\${name}`,
	messages,
});
const over = (rule: 'complexity' | 'max-lines-per-function', name: string, n: number): object => ({
	line: 10,
	message:
		rule === 'complexity'
			? `Function '${name}' has a complexity of ${n}. Maximum allowed is 7.`
			: `Function '${name}' has too many lines (${n}). Maximum allowed is 40.`,
	ruleId: rule,
});
const normal = JSON.stringify([
	file('a.ts', [over('complexity', 'alpha', 12), over('max-lines-per-function', 'alpha', 61)]),
	file('b.ts', [
		over('complexity', 'beta', 9),
		{ line: 1, message: 'Unused.', ruleId: 'no-unused-vars' },
	]),
	file('c.ts', []),
]);

describe('function-size ratchet report parsing', () => {
	test('reads rule offenders with their measures', () => {
		const measured = parseReport(normal, 0, '', ROOT);

		expect(measured.files).toBe(3);
		expect(measured.complexity.map((o) => [o.file, o.name, o.measure])).toEqual([
			['backend/src/a.ts', 'alpha', 12],
			['backend/src/b.ts', 'beta', 9],
		]);
		expect(measured.lines.map((o) => o.measure)).toEqual([61]);
	});

	// ESLint exits 1 when any message has error severity. With rule messages only that is still
	// a complete measurement.
	test('a nonzero exit with only rule messages is still a measurement', () => {
		expect(parseReport(normal, 1, '', ROOT).complexity).toHaveLength(2);
	});

	test('refuses a report with a file it could not parse, and names the file', () => {
		const fatal = JSON.stringify([
			file('a.ts', [over('complexity', 'alpha', 12)]),
			file('broken.ts', [
				{ fatal: true, line: 3, message: 'Parsing error: Unexpected token', ruleId: null },
			]),
		]);

		expect(() => parseReport(fatal, 1, '', ROOT)).toThrow(
			/could not measure 1 file\(s\).*backend\/src\/broken\.ts/,
		);
	});

	test('refuses a rule-less diagnostic, an empty report and output that is not JSON', () => {
		const ruleless = JSON.stringify([
			file('a.ts', [{ line: 1, message: 'Something.', ruleId: null }]),
		]);

		expect(() => parseReport(ruleless, 0, '', ROOT)).toThrow(/could not measure 1 file/);
		expect(() => parseReport('', 2, 'boom', ROOT)).toThrow(/no report \(exit 2\)/);
		expect(() => parseReport('[]', 0, '', ROOT)).toThrow(/no report/);
		expect(() => parseReport('Oops: something', 2, '', ROOT)).toThrow(/not JSON/);
	});
});

describe('function-size ratchet baseline', () => {
	// A baseline that could be re-recorded at will would let the counts rise. Both outcomes run
	// against a throwaway path with a stand-in measurement: called on the repository's own path,
	// the first would write a real baseline wherever none exists.
	test('records once into the path it is given, then refuses, and leaves the real one alone', async () => {
		const ownBaseline = join(import.meta.dir, '../../scripts/function-size-baseline.json');
		const ownBefore = existsSync(ownBaseline) ? readFileSync(ownBaseline, 'utf8') : null;
		const scratchBaseline = join(
			await testTempDir('aidd-function-size-'),
			'function-size-baseline.json',
		);
		const standIn = () => parseReport(normal, 0, '', ROOT);
		const said: string[] = [];
		const realError = console.error;
		const realLog = console.log;
		console.error = (message: string) => said.push(message);
		console.log = (message: string) => said.push(message);
		try {
			expect(recordBaseline(scratchBaseline, standIn)).toBe(0);
			const recorded = readFileSync(scratchBaseline, 'utf8');
			expect(JSON.parse(recorded)).toEqual({
				complexity: { over: 2, threshold: 7 },
				lines: { over: 1, threshold: 40 },
			});
			expect(recordBaseline(scratchBaseline, standIn)).toBe(1);
			expect(readFileSync(scratchBaseline, 'utf8')).toBe(recorded);
		} finally {
			console.error = realError;
			console.log = realLog;
		}
		expect(said.join('\n')).toContain('baseline recorded');
		expect(said.join('\n')).toContain('already has a baseline');
		expect(existsSync(ownBaseline) ? readFileSync(ownBaseline, 'utf8') : null).toBe(ownBefore);
	});
});

describe('function-size ratchet wiring', () => {
	test('is a smoke:qc step', () => {
		expect(SMOKE_QC_STEPS.map((step) => step.name)).toContain('check:function-size');
	});

	// The measurement is syntax-only: no config lookup, the parser named by path. A repository
	// lint config would load the type-aware project service and cost ten times the time for the
	// same two counts.
	test('runs ESLint without config lookup and with a parser that exists', () => {
		const args = eslintArgs({
			complexity: { over: 0, threshold: 7 },
			lines: { over: 0, threshold: 40 },
		});
		const parser = args[args.indexOf('--parser') + 1] ?? '';

		expect(args).toContain('--no-config-lookup');
		expect(args.slice(args.indexOf('--ext'), args.indexOf('--ext') + 2)).toEqual([
			'--ext',
			'.ts,.tsx,.js,.jsx',
		]);
		expect(args).toContain('--no-inline-config');
		expect(existsSync(parser)).toBe(true);
	});

	// The gate hands ESLint whole directories with --ext ts, tsx, js and jsx, so the cached pass
	// has to be invalidated by any of those under any measured root and by the toolchain
	// manifests. It reads no lint config or tsconfig, so those must not invalidate it.
	test('its cache entry covers everything it measures or measures with', () => {
		const globs = STEP_DEPENDENCIES['check:function-size'] ?? [];
		const covered = (path: string): boolean =>
			globs.some((glob) => new Bun.Glob(glob).match(path));

		for (const path of [
			'cli/src/modes/new.ts',
			'cli/src/modes/legacy.js',
			'backend/src/services/new.ts',
			'backend/src/services/new.js',
			'frontend/src/pages/New.tsx',
			'frontend/src/pages/New.jsx',
			'shared/src/new.ts',
			'shared/src/new.js',
			'package.json',
			'cli/package.json',
			'bun.lock',
			'scripts/check-function-size.ts',
			'scripts/function-size-baseline.json',
		]) {
			expect([path, covered(path)]).toEqual([path, true]);
		}
		for (const path of [
			'frontend/dist/out.js',
			'frontend/src/styles.css',
			'docs/README.md',
			'eslint.config.js',
			'frontend/eslint.config.js',
			'tsconfig.json',
			'backend/tsconfig.json',
			'cli/tsconfig.json',
			'frontend/tsconfig.json',
			'shared/tsconfig.json',
		]) {
			expect([path, covered(path)]).toEqual([path, false]);
		}
	});
});
