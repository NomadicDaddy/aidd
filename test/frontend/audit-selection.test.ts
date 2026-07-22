import { describe, expect, test } from 'bun:test';

import {
	clearVisibleAudits,
	deriveVisibleSelection,
	selectVisibleAudits,
	toggleAuditSelected,
} from '../../frontend/src/pages/audits/auditSelection.ts';

describe('selectVisibleAudits', () => {
	test('adds every visible enabled audit to the selection', () => {
		expect(selectVisibleAudits([], ['SECURITY', 'PERF'])).toEqual(['SECURITY', 'PERF']);
	});

	test('preserves already-selected names not currently visible and de-duplicates', () => {
		expect(selectVisibleAudits(['HIDDEN', 'SECURITY'], ['SECURITY', 'PERF'])).toEqual([
			'HIDDEN',
			'SECURITY',
			'PERF',
		]);
	});
});

describe('clearVisibleAudits', () => {
	test('removes only the visible enabled audits, leaving off-screen selections intact', () => {
		expect(clearVisibleAudits(['HIDDEN', 'SECURITY', 'PERF'], ['SECURITY', 'PERF'])).toEqual([
			'HIDDEN',
		]);
	});

	test('is a no-op when nothing visible is selected', () => {
		expect(clearVisibleAudits(['HIDDEN'], ['SECURITY', 'PERF'])).toEqual(['HIDDEN']);
	});
});

describe('toggleAuditSelected', () => {
	const enabled = new Set(['SECURITY', 'PERF']);

	test('adds an enabled audit that is not yet selected', () => {
		expect(toggleAuditSelected([], 'SECURITY', enabled)).toEqual(['SECURITY']);
	});

	test('removes an enabled audit that is already selected', () => {
		expect(toggleAuditSelected(['SECURITY', 'PERF'], 'SECURITY', enabled)).toEqual(['PERF']);
	});

	test('is a no-op for a disabled audit (returns the same reference)', () => {
		const current = ['SECURITY'];
		const next = toggleAuditSelected(current, 'DISABLED', enabled);
		expect(next).toBe(current);
	});
});

describe('deriveVisibleSelection', () => {
	test('reports all selected when every visible enabled audit is selected', () => {
		const state = deriveVisibleSelection(['SECURITY', 'PERF'], ['SECURITY', 'PERF']);
		expect(state.allSelected).toBe(true);
		expect(state.someSelected).toBe(true);
		expect(state.visibleSelectedNames).toEqual(['SECURITY', 'PERF']);
	});

	test('reports partial selection as some-but-not-all', () => {
		const state = deriveVisibleSelection(['SECURITY', 'PERF'], ['SECURITY']);
		expect(state.allSelected).toBe(false);
		expect(state.someSelected).toBe(true);
		expect(state.visibleSelectedNames).toEqual(['SECURITY']);
	});

	test('ignores selected names that are not currently visible', () => {
		const state = deriveVisibleSelection(['SECURITY'], ['SECURITY', 'HIDDEN']);
		expect(state.allSelected).toBe(true);
		expect(state.someSelected).toBe(true);
		expect(state.visibleSelectedNames).toEqual(['SECURITY']);
	});

	test('is neither all nor some when no audits are visible', () => {
		const state = deriveVisibleSelection([], ['SECURITY']);
		expect(state.allSelected).toBe(false);
		expect(state.someSelected).toBe(false);
		expect(state.visibleSelectedNames).toEqual([]);
	});
});
