import { describe, expect, test } from 'bun:test';

import { cliRunWebStatus } from '../../backend/src/services/run/cliActiveRunRecord.ts';
import { createCliActiveRunRecord } from '../../shared/src/metadata/active-runs.ts';

function record(state: string) {
	return {
		...createCliActiveRunRecord({
			backend: 'native',
			mode: 'coding',
			model: undefined,
			projectDir: 'D:/projects/demo',
			provider: undefined,
			reasoningEffort: 'low',
		}),
		state,
	};
}

describe('cliRunWebStatus', () => {
	test('a run parked on a merge conflict lists as waiting_approval, not failed', () => {
		expect(cliRunWebStatus(record('waiting_approval'))).toBe('waiting_approval');
	});

	test('maps the other terminal states as the heartbeat watcher does', () => {
		expect(cliRunWebStatus(record('completed'))).toBe('completed');
		expect(cliRunWebStatus(record('stopped'))).toBe('stopped');
		expect(cliRunWebStatus(record('failed'))).toBe('failed');
		expect(cliRunWebStatus(record('blocked'))).toBe('failed');
		expect(cliRunWebStatus(record('agent:tool_call'))).toBe('running');
	});
});
