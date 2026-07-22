import { describe, expect, test } from 'bun:test';

import { consumeInitialRunScroll } from '../../frontend/src/pages/runs/runsUtils.ts';

describe('Runs-page initial deep-link scrolling', () => {
	test('never scrolls a plain /runs visit across repeated selections', () => {
		const initialRunId = { current: undefined as string | undefined };
		let scrollCount = 0;
		const scroll = () => {
			scrollCount += 1;
		};

		consumeInitialRunScroll(initialRunId, undefined, scroll);
		consumeInitialRunScroll(initialRunId, undefined, scroll);

		expect(scrollCount).toBe(0);
	});

	test('waits for the deep-linked run and scrolls it only once', () => {
		const initialRunId = { current: 'run-1' as string | undefined };
		let scrollCount = 0;
		const scroll = () => {
			scrollCount += 1;
		};

		consumeInitialRunScroll(initialRunId, undefined, scroll);
		consumeInitialRunScroll(initialRunId, 'run-2', scroll);
		expect(scrollCount).toBe(0);

		consumeInitialRunScroll(initialRunId, 'run-1', scroll);
		consumeInitialRunScroll(initialRunId, 'run-1', scroll);

		expect(scrollCount).toBe(1);
		expect(initialRunId.current).toBeUndefined();
	});
});
