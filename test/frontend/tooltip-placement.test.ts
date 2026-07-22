import { describe, expect, test } from 'bun:test';

import {
	resolveTooltipPlacement,
	TOOLTIP_TRIGGER_GAP,
	TOOLTIP_VIEWPORT_MARGIN,
} from '../../frontend/src/components/ui/tooltipPlacement.ts';

const viewport = { height: 800, width: 1280 };
const size = { height: 40, width: 200 };

describe('tooltip placement', () => {
	test('keeps the preferred side when it fits', () => {
		const anchor = { bottom: 416, left: 600, top: 400, width: 24 };

		expect(resolveTooltipPlacement(anchor, size, viewport, 'top')).toEqual({
			left: 600 + 12 - 100,
			side: 'top',
			top: 400 - TOOLTIP_TRIGGER_GAP - size.height,
		});
		expect(resolveTooltipPlacement(anchor, size, viewport, 'bottom')).toEqual({
			left: 600 + 12 - 100,
			side: 'bottom',
			top: 416 + TOOLTIP_TRIGGER_GAP,
		});
	});

	test('flips below when a top tooltip would leave the viewport', () => {
		const anchor = { bottom: 36, left: 600, top: 20, width: 24 };

		const placement = resolveTooltipPlacement(anchor, size, viewport, 'top');

		expect(placement.side).toBe('bottom');
		expect(placement.top).toBe(36 + TOOLTIP_TRIGGER_GAP);
	});

	test('flips above when a bottom tooltip would leave the viewport', () => {
		const anchor = { bottom: 790, left: 600, top: 774, width: 24 };

		const placement = resolveTooltipPlacement(anchor, size, viewport, 'bottom');

		expect(placement.side).toBe('top');
		expect(placement.top).toBe(774 - TOOLTIP_TRIGGER_GAP - size.height);
	});

	test('keeps the preferred side when neither side fits, clamped into the viewport', () => {
		const tall = { height: 900, width: 200 };
		const anchor = { bottom: 416, left: 600, top: 400, width: 24 };

		const placement = resolveTooltipPlacement(anchor, tall, viewport, 'top');

		expect(placement.side).toBe('top');
		expect(placement.top).toBe(TOOLTIP_VIEWPORT_MARGIN);
	});

	test('clamps horizontally at the left and right viewport edges', () => {
		const nearLeft = { bottom: 416, left: 10, top: 400, width: 24 };
		const nearRight = { bottom: 416, left: 1250, top: 400, width: 24 };

		expect(resolveTooltipPlacement(nearLeft, size, viewport, 'top').left).toBe(
			TOOLTIP_VIEWPORT_MARGIN
		);
		expect(resolveTooltipPlacement(nearRight, size, viewport, 'top').left).toBe(
			viewport.width - TOOLTIP_VIEWPORT_MARGIN - size.width
		);
	});
});
