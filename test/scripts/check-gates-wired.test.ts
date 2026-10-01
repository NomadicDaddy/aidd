import { describe, expect, test } from 'bun:test';

import { findUnwiredGates, runGatesWiredCheck } from '../../scripts/check-gates-wired.ts';

const wired = (...names: string[]) => new Set(names);

describe('check:gates-wired', () => {
	test('passes when every test script is wired or excused with a reason', () => {
		const findings = findUnwiredGates(['lint', 'test:a', 'test:slow'], wired('test:a'), {
			'test:slow': 'needs a device',
		});
		expect(findings).toEqual([]);
	});

	test('fails on a test script no step runs', () => {
		const findings = findUnwiredGates(['test:a', 'test:b'], wired('test:a'), {});
		expect(findings.join('\n')).toContain('test:b is run by no smoke:qc step');
	});

	// The control that matters: a longer wired name must not wire its own prefix.
	test('does not treat a prefix of a wired name as wired', () => {
		const findings = findUnwiredGates(
			['test:api', 'test:api-types'],
			wired('test:api-types'),
			{},
		);
		expect(findings.join('\n')).toContain('test:api is run by no smoke:qc step');
	});

	test('fails on an excuse with no reason', () => {
		const findings = findUnwiredGates(['test:slow'], wired(), { 'test:slow': '  ' });
		expect(findings.join('\n')).toContain('excused without a reason');
	});

	test('fails on an excuse for a script that no longer exists', () => {
		const findings = findUnwiredGates(['test:a'], wired('test:a'), { 'test:gone': 'was slow' });
		expect(findings.join('\n')).toContain('test:gone is excused but is not a script');
	});

	test('fails on an excuse for a script a step now runs', () => {
		const findings = findUnwiredGates(['test:a'], wired('test:a'), { 'test:a': 'was slow' });
		expect(findings.join('\n')).toContain('test:a is excused but a qc step runs it');
	});

	test('fails when there is no test script to examine', () => {
		expect(findUnwiredGates(['lint'], wired(), {}).join('\n')).toContain('defines no test:*');
	});

	test('this repository passes, and examines more than the excused scripts', () => {
		const result = runGatesWiredCheck();
		expect(result.findings).toEqual([]);
		expect(result.examined).toBeGreaterThan(1);
	});
});
