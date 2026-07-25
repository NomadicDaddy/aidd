import { describe, expect, test } from 'bun:test';

import { statusTone } from '../../frontend/src/pages/projects/detail/shared.ts';

describe('statusTone', () => {
	test('maps each canonical feature status to its tone', () => {
		expect(statusTone('completed')).toBe('emerald');
		expect(statusTone('in_progress')).toBe('teal');
		expect(statusTone('waiting_approval')).toBe('amber');
		expect(statusTone('backlog')).toBe('neutral');
	});

	test('keeps the missing-status placeholder neutral', () => {
		expect(statusTone('unknown')).toBe('neutral');
	});

	test('renders non-canonical statuses as invalid (red), never as completed', () => {
		// 'completed' is the only completion status — strays must not alias to it.
		expect(statusTone('done')).toBe('red');
		expect(statusTone('verified')).toBe('red');
		expect(statusTone('in-progress')).toBe('red');
		expect(statusTone('waiting-approval')).toBe('red');
	});
});
