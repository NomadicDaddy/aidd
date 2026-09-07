import { describe, expect, test } from 'bun:test';

import {
	canonicalJson,
	compareCodepoints,
	sha256Json,
	sha256Set,
	sha256Text,
} from '../../shared/src/content-hash.ts';

describe('content hashing', () => {
	test('CRLF and LF spellings of a document hash equal, and a leading BOM is ignored', () => {
		const lf = sha256Text('# Title\n\nbody\n');
		expect(sha256Text('# Title\r\n\r\nbody\r\n')).toBe(lf);
		expect(sha256Text('﻿# Title\n\nbody\n')).toBe(lf);
		expect(sha256Text('# Title\n\nbody')).not.toBe(lf);
	});

	test('object key order never changes sha256Json', () => {
		expect(sha256Json({ b: [{ z: 1, y: 2 }], a: { d: null, c: 'x' } })).toBe(
			sha256Json({ a: { c: 'x', d: null }, b: [{ y: 2, z: 1 }] }),
		);
		expect(canonicalJson({ b: 1, a: [3, { d: 1, c: 2 }] })).toBe(
			'{"a":[3,{"c":2,"d":1}],"b":1}',
		);
		// Arrays are ordered data; only object keys are normalized.
		expect(sha256Json([2, 1])).not.toBe(sha256Json([1, 2]));
	});

	test('sha256Set distinguishes sets whose members concatenate to the same bytes', () => {
		const split = [
			{ id: 'first', sha256: sha256Text('A\nB\n') },
			{ id: 'second', sha256: sha256Text('C\n') },
		];
		const merged = [
			{ id: 'first', sha256: sha256Text('A\n') },
			{ id: 'second', sha256: sha256Text('B\nC\n') },
		];
		expect(sha256Text('A\nB\n' + 'C\n')).toBe(sha256Text('A\n' + 'B\nC\n'));
		expect(sha256Set(split)).not.toBe(sha256Set(merged));
		expect(sha256Set([...split].reverse())).toBe(sha256Set(split));
	});

	test('compareCodepoints orders by code point rather than locale', () => {
		expect(['b', 'B', 'a', 'Z', 'a-b', 'a'].sort(compareCodepoints)).toEqual([
			'B',
			'Z',
			'a',
			'a',
			'a-b',
			'b',
		]);
	});
});
