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

	test('a ?pipeline= deep link scrolls once when its session resolves', () => {
		// useRunsPage feeds the same helper the initial selection id regardless of kind,
		// so a pipeline-session deep link follows identical mechanics to ?run=.
		const initialSelectionId = { current: 'sess-1' as string | undefined };
		let scrollCount = 0;
		const scroll = () => {
			scrollCount += 1;
		};

		consumeInitialRunScroll(initialSelectionId, undefined, scroll);
		expect(scrollCount).toBe(0);

		consumeInitialRunScroll(initialSelectionId, 'sess-1', scroll);
		consumeInitialRunScroll(initialSelectionId, 'sess-1', scroll);

		expect(scrollCount).toBe(1);
		expect(initialSelectionId.current).toBeUndefined();
	});
});
