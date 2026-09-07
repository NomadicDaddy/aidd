import { describe, expect, test } from 'bun:test';
import { parkedWorkMarker } from 'aidd-shared/runs/outcome';

import { indexParkedWorkRuns } from '../../backend/src/services/pipeline/parkedWork.ts';

function run(sessionId: null | string, summary: null | string) {
	return { pipelineSessionId: sessionId, summary };
}

describe('indexParkedWorkRuns', () => {
	// The session this closes over: three coding steps, every step row completed, session status
	// completed — and all three features parked as waiting_approval. Nothing on the session said so.
	test('counts the runs of a session that parked instead of completing', () => {
		const index = indexParkedWorkRuns([
			run('pipe_a', `coding parked one; ${parkedWorkMarker} one was parked, not completed`),
			run('pipe_a', 'coding completed two; 1 incomplete feature(s) remain'),
			run(
				'pipe_a',
				`coding parked three; ${parkedWorkMarker} three was parked, not completed`,
			),
			run('pipe_b', 'coding completed four'),
		]);
		expect(index.get('pipe_a')).toBe(2);
		expect(index.has('pipe_b')).toBe(false);
	});

	test('ignores runs with no session and summaries with no marker', () => {
		const index = indexParkedWorkRuns([
			run(null, `${parkedWorkMarker} orphan was parked, not completed`),
			run('pipe_a', null),
		]);
		expect(index.size).toBe(0);
	});
});
