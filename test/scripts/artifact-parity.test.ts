import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { findParityProblems, parseScaffold } from '../../scripts/check-artifact-parity.ts';

// Each case drives one failure path of the checker. The checker's whole value is that it fails on
// drift; a green run against the real files proves only the happy path, so every branch below is
// exercised against synthetic input.
const catalog = (rows: string) =>
	['| Artifact | Severity | Refresh Process |', '| --- | --- | --- |', rows].join('\n');
const spec = catalog('| `.aidd/spec.md` | required | onboarding |');

describe('artifact parity checker', () => {
	test('a scaffold that does not ignore .aidd/ wholesale fails', () => {
		// Per-path rules alone leave every unlisted path committable, which is how runs.jsonl came
		// to be tracked in six applications.
		const problems = findParityProblems(spec, '.aidd/runs.jsonl\n');
		expect(problems.some((p) => p.includes('no `/.aidd/` rule'))).toBe(true);
	});

	test('a per-path rule beside the wholesale rule is redundant and fails', () => {
		const problems = findParityProblems(spec, '/.aidd/\n.aidd/reports/\n');
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('rule `.aidd/reports/` is redundant');
	});

	test('a repeated wholesale rule fails the exactly-one invariant', () => {
		const problems = findParityProblems(spec, '/.aidd/\n.aidd/\n');
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('The invariant is exactly one');
	});

	test('malformed row is reported, never silently skipped', () => {
		// The real `.aidd/iterations/*.json`, `.log` row parsed as nothing and was skipped by an
		// earlier checker — a validator that ignores what it cannot read is worse than none.
		const problems = findParityProblems(
			catalog('| `.aidd/iterations/*.json`, `.log` | runtime | logs |'),
			'/.aidd/\n',
		);
		expect(problems.some((p) => p.includes('not exactly one backticked path'))).toBe(true);
	});

	test('unknown class fails', () => {
		const problems = findParityProblems(
			catalog('| `.aidd/spec.md` | wishful | x |'),
			'/.aidd/\n',
		);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('unknown class');
	});

	test('the root-anchored wholesale rule is honoured, as is the unanchored one', () => {
		expect(parseScaffold('/.aidd/\n')).toEqual(['.aidd/']);
		expect(findParityProblems(spec, '/.aidd/\n')).toEqual([]);
		expect(findParityProblems(spec, '.aidd/\n')).toEqual([]);
	});

	test('the real catalog and scaffold agree', () => {
		const root = resolve(import.meta.dir, '..', '..');
		const problems = findParityProblems(
			readFileSync(resolve(root, 'docs', 'reference', 'artifacts.md'), 'utf8'),
			readFileSync(resolve(root, 'scaffolding', '.gitignore'), 'utf8'),
		);
		expect(problems).toEqual([]);
	});
});
