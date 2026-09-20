import { describe, expect, test } from 'bun:test';

import { activeSessionMissing } from '../../frontend/src/pages/director/directorUtils.ts';

const SESSIONS = [{ id: 'dir_chat_a' }, { id: 'dir_chat_b' }];

describe('activeSessionMissing', () => {
	// The finding behind this helper: a tab held dir_chat_1786788644027 after it was deleted, and
	// every invalidation re-requested it. React Query retries a 5xx three times, so one stale id
	// produced the four 'unhandled web error' lines in backend.log.
	test('reports a selected session the server no longer lists', () => {
		expect(activeSessionMissing('dir_chat_gone', { data: SESSIONS, isFetching: false })).toBe(
			true,
		);
	});

	test('leaves a selection the server still lists alone', () => {
		expect(activeSessionMissing('dir_chat_b', { data: SESSIONS, isFetching: false })).toBe(
			false,
		);
	});

	// The reason the settled-list guard exists: startSession selects the new id and invalidates the
	// list in the same callback, so for one render the id is legitimately absent. Without this the
	// operator would be bounced straight back out of the chat they just started.
	test('holds its judgement while the session list is in flight', () => {
		expect(activeSessionMissing('dir_chat_new', { data: SESSIONS, isFetching: true })).toBe(
			false,
		);
	});

	test('says nothing before the first list arrives, or with no selection', () => {
		expect(activeSessionMissing('dir_chat_a', { data: undefined, isFetching: false })).toBe(
			false,
		);
		expect(activeSessionMissing(undefined, { data: SESSIONS, isFetching: false })).toBe(false);
	});

	// An empty list is settled, not unknown: the last session was deleted, so the selection has to
	// clear rather than linger on a conversation that is gone.
	test('clears the selection when every session has been deleted', () => {
		expect(activeSessionMissing('dir_chat_a', { data: [], isFetching: false })).toBe(true);
	});
});
