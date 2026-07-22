import { describe, expect, test } from 'bun:test';

import { getConcurrentTestBlocker } from '../../scripts/smoke-qc.ts';

const ACTIVE_RUN = {
	pid: 4321,
	rootDir: 'D:/applications/aidd',
	startedAt: 1,
};

describe('smoke:qc required-step blockers', () => {
	test('fails when the required test step cannot run', () => {
		const blocker = getConcurrentTestBlocker('test', ACTIVE_RUN);

		expect(blocker?.exitCode).toBe(1);
		expect(blocker?.message).toContain('tests were NOT validated by this run');
	});

	test('does not block unrelated steps or an unlocked test step', () => {
		expect(getConcurrentTestBlocker('lint', ACTIVE_RUN)).toBeNull();
		expect(getConcurrentTestBlocker('test', undefined)).toBeNull();
	});
});
