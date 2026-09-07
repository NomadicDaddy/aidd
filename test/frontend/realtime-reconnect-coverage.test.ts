import type { WebSocketEventType } from 'aidd-shared/contracts/websocket';

import { webSocketEventTypes } from 'aidd-shared/contracts/websocket';
import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	realtimeEventInvalidations,
	realtimeInvalidationKeysForMessage,
	type RealtimeQueryKey,
	realtimeReconnectKeys,
	reconnectOnlyKeys,
} from '../../frontend/src/hooks/realtimeInvalidationKeys.ts';

const HOOKS_DIR = join(import.meta.dir, '..', '..', 'frontend', 'src', 'hooks');

// One representative frame per event type, carrying the payload ids the scoped keys read.
const samplePayloads: Record<WebSocketEventType, unknown> = {
	ack: {},
	app_launch: { projectId: 'proj_alpha' },
	connected: {},
	director_cycle: { cycleId: 'cyc_1', stage: 'plan', status: 'running' },
	pipeline_progress: { completedTopLevelSteps: 1, sessionId: 'pipe_1' },
	pipeline_status: { sessionId: 'pipe_1', status: 'running' },
	run_output: { chunk: 'hello', stream: 'stdout' },
	run_status: { status: 'completed' },
	suggestion_status: { status: 'accepted' },
};

/** React Query's own prefix match: a shorter key invalidates every key that starts with it. */
function coveredByReconnect(key: RealtimeQueryKey): boolean {
	return realtimeReconnectKeys.some(
		(candidate) =>
			candidate.length <= key.length && candidate.every((part, i) => part === key[i]),
	);
}

const serializedReconnectKeys = new Set(realtimeReconnectKeys.map((key) => JSON.stringify(key)));

describe('realtime reconnect coverage', () => {
	test('reconnect refreshes every key an event refreshes, ids and all', () => {
		const uncovered: string[] = [];
		for (const eventType of webSocketEventTypes) {
			const keys = realtimeInvalidationKeysForMessage({
				payload: samplePayloads[eventType],
				type: eventType,
			});
			for (const key of keys) {
				if (!coveredByReconnect(key))
					uncovered.push(`${eventType}: ${JSON.stringify(key)}`);
			}
		}
		expect(uncovered).toEqual([]);
	});

	test('respects prefix boundaries instead of over-broadening', () => {
		// The regression the hand-written list carried: director_cycle and suggestion_status
		// refresh the two-element fleet key, and director_cycle refreshes stored run output.
		expect(serializedReconnectKeys.has(JSON.stringify(['director', 'fleet']))).toBe(true);
		expect(serializedReconnectKeys.has(JSON.stringify(['run-output']))).toBe(true);
		// A one-element ['director'] would also match the director-profile and director-chat
		// families, which no event changes.
		expect(serializedReconnectKeys.has(JSON.stringify(['director']))).toBe(false);
		// Prefix-reduced: ['projects'] already covers the dashboard summary entry, so reconnect
		// must not spend a second refetch on it.
		expect(serializedReconnectKeys.has(JSON.stringify(['projects', 'dashboard-summary']))).toBe(
			false,
		);
		expect(coveredByReconnect(['projects', 'dashboard-summary'])).toBe(true);
		expect(coveredByReconnect(['app-launch', 'proj_alpha'])).toBe(true);
		expect(coveredByReconnect(['pipeline-session-report', 'pipe_1'])).toBe(true);
	});

	test('stays a bounded set with no redundant or empty key', () => {
		expect(realtimeReconnectKeys.length).toBeGreaterThan(0);
		expect(realtimeReconnectKeys.length).toBeLessThan(20);
		expect(serializedReconnectKeys.size).toBe(realtimeReconnectKeys.length);
		for (const key of realtimeReconnectKeys) {
			// An empty key matches every query in the cache; that is the "invalidate everything"
			// this set exists to avoid.
			expect(key.length).toBeGreaterThan(0);
			const covering = realtimeReconnectKeys.filter(
				(other) => other.length < key.length && other.every((part, i) => part === key[i]),
			);
			expect(covering).toEqual([]);
		}
	});

	test('records why a key is absent or present without an event behind it', () => {
		for (const [eventType, entry] of Object.entries(realtimeEventInvalidations)) {
			if (entry.keys.length === 0) {
				expect(`${eventType}: ${entry.noQueries ?? ''}`.length).toBeGreaterThan(
					eventType.length + 20,
				);
			} else {
				expect(entry.noQueries).toBeUndefined();
			}
		}
		expect(realtimeEventInvalidations.run_output.keys).toEqual([]);
		expect(realtimeEventInvalidations.run_output.noQueries).toContain('useRunLiveOutput');

		const eventProduced = new Set<string>();
		for (const eventType of webSocketEventTypes) {
			for (const key of realtimeInvalidationKeysForMessage({
				payload: samplePayloads[eventType],
				type: eventType,
			})) {
				eventProduced.add(JSON.stringify(key));
			}
			for (const prefix of realtimeEventInvalidations[eventType].scoped?.prefixes ?? []) {
				eventProduced.add(JSON.stringify(prefix));
			}
		}
		for (const extra of reconnectOnlyKeys) {
			// A reconnect-only key is a claim that needs a stated reason, not a leftover.
			expect(extra.reason.length).toBeGreaterThan(20);
			expect(eventProduced.has(JSON.stringify(extra.key))).toBe(false);
			expect(serializedReconnectKeys.has(JSON.stringify(extra.key))).toBe(true);
		}
	});

	test('an unrecognized frame refreshes nothing', () => {
		expect(realtimeInvalidationKeysForMessage({ payload: {}, type: 'raw' })).toEqual([]);
		// A scoped event with no id in the payload refreshes its unscoped keys only.
		expect(realtimeInvalidationKeysForMessage({ payload: {}, type: 'app_launch' })).toEqual([
			['app-launch-all'],
			['port-status'],
			['projects', 'dashboard-summary'],
		]);
	});

	test('the hook reads both sets from the declaration instead of listing keys', async () => {
		const source = await readFile(join(HOOKS_DIR, 'useRealtimeInvalidation.ts'), 'utf8');
		expect(source).toContain('realtimeInvalidationKeysForMessage(message)');
		expect(source).toContain('for (const queryKey of realtimeReconnectKeys)');
		// The exhaustive switch stays: it routes frames and keeps the compile-time guard from
		// [[websocket-event-contract]], but it no longer carries keys of its own.
		expect(source).toContain('assertHandled(eventType)');
		// The drift this replaced: two hand-copied literal lists in one file.
		expect([...source.matchAll(/invalidate\(\['/g)].length).toBe(0);
	});
});
