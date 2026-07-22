import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { findParityProblems, matches, parseScaffold } from '../../scripts/check-artifact-parity.ts';

// Each case drives one failure path of the checker. The checker's whole value is that it fails on
// drift; a green run against the real files proves only the happy path, so every branch below is
// exercised against synthetic input.
const catalog = (rows: string) =>
	['| Artifact | Severity | Refresh Process |', '| --- | --- | --- |', rows].join('\n');

describe('artifact parity checker', () => {
	test('non-committed row with no ignore rule fails — the runs.jsonl regression', () => {
		// runs.jsonl was classed `runtime` for months while no scaffold rule matched it, so it was
		// committed in six applications. This is that exact drift, reproduced.
		const problems = findParityProblems(
			catalog('| `.aidd/runs.jsonl` | runtime | ledger |'),
			'.aidd/iterations/\n'
		);
		expect(problems).toHaveLength(2); // the unmatched row + the now-orphaned iterations rule
		expect(problems[0]).toContain('would be committed silently');
		expect(problems[0]).toContain('.aidd/runs.jsonl');
	});

	test('committed row hidden by an ignore rule fails', () => {
		const problems = findParityProblems(
			catalog('| `.aidd/spec.md` | required | onboarding |'),
			'.aidd/spec.md\n'
		);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('would never be committed');
	});

	test('ignore rule with no catalog row fails', () => {
		const problems = findParityProblems(
			catalog('| `.aidd/spec.md` | required | onboarding |'),
			'.aidd/mystery-dir/\n'
		);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('has no row in the catalog');
	});

	test('malformed row is reported, never silently skipped', () => {
		// The real `.aidd/iterations/*.json`, `.log` row parsed as nothing and was skipped by an
		// earlier checker — a validator that ignores what it cannot read is worse than none.
		const problems = findParityProblems(
			catalog('| `.aidd/iterations/*.json`, `.log` | runtime | logs |'),
			'.aidd/iterations/\n'
		);
		expect(problems.some((p) => p.includes('not exactly one backticked path'))).toBe(true);
	});

	test('redundant overlapping rules fail the exactly-one invariant', () => {
		const problems = findParityProblems(
			catalog('| `.aidd/reports/` | generated | reports |'),
			'.aidd/reports/\n.aidd/reports\n'
		);
		expect(problems.some((p) => p.includes('The invariant is exactly one'))).toBe(true);
	});

	test('unknown class fails', () => {
		const problems = findParityProblems(catalog('| `.aidd/spec.md` | wishful | x |'), '');
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('unknown class');
	});

	test('root-anchored rules are honoured, not skipped', () => {
		// `/.aidd/x` and `.aidd/x` target the same path; skipping anchored rules would exempt
		// exactly the rules a stricter author writes.
		expect(parseScaffold('/.aidd/runs.jsonl\n')).toEqual(['.aidd/runs.jsonl']);
		const problems = findParityProblems(
			catalog('| `.aidd/runs.jsonl` | runtime | ledger |'),
			'/.aidd/runs.jsonl\n'
		);
		expect(problems).toEqual([]);
	});

	test('directory rules match paths beneath them; wildcards match suffixes', () => {
		expect(matches('.aidd/reports/', '.aidd/reports/')).toBe(true);
		expect(matches('.aidd/reports/x.md', '.aidd/reports/')).toBe(true);
		expect(matches('.aidd/runs.jsonl.bak-manual', '.aidd/runs.jsonl.bak*')).toBe(true);
		expect(matches('.aidd/runs.jsonl', '.aidd/runs.jsonl.bak*')).toBe(false);
		// A dot in a rule must not act as a regex wildcard.
		expect(matches('.aidd/runsXjsonl', '.aidd/runs.jsonl')).toBe(false);
	});

	test('the real catalog and scaffold agree', () => {
		const root = resolve(import.meta.dir, '..', '..');
		const problems = findParityProblems(
			readFileSync(resolve(root, 'docs', 'reference', 'artifacts.md'), 'utf8'),
			readFileSync(resolve(root, 'scaffolding', '.gitignore'), 'utf8')
		);
		expect(problems).toEqual([]);
	});
});
