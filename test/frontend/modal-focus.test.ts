import { describe, expect, test } from 'bun:test';

import { nextFocusIndex } from '../../frontend/src/components/layout/modal-focus.ts';

describe('nextFocusIndex (report modal focus trap)', () => {
	test('returns -1 when there is nothing focusable', () => {
		expect(nextFocusIndex(0, -1, false)).toBe(-1);
		expect(nextFocusIndex(0, 0, true)).toBe(-1);
	});

	test('Tab advances to the next control', () => {
		expect(nextFocusIndex(4, 0, false)).toBe(1);
		expect(nextFocusIndex(4, 2, false)).toBe(3);
	});

	test('Tab wraps from the last control back to the first', () => {
		expect(nextFocusIndex(4, 3, false)).toBe(0);
	});

	test('Shift+Tab moves to the previous control', () => {
		expect(nextFocusIndex(4, 3, true)).toBe(2);
		expect(nextFocusIndex(4, 1, true)).toBe(0);
	});

	test('Shift+Tab wraps from the first control back to the last', () => {
		expect(nextFocusIndex(4, 0, true)).toBe(3);
	});

	test('Tab from an unknown focus position lands on the first control', () => {
		expect(nextFocusIndex(4, -1, false)).toBe(0);
	});

	test('Shift+Tab from an unknown focus position lands on the last control', () => {
		expect(nextFocusIndex(4, -1, true)).toBe(3);
	});
});
