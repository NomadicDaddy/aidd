import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	isTooltipAnchorVisible,
	resolveTooltipPlacement,
	TOOLTIP_TRIGGER_GAP,
	TOOLTIP_VIEWPORT_MARGIN,
} from '../../frontend/src/components/ui/tooltipPlacement.ts';

const viewport = { height: 800, width: 1280 };
const size = { height: 40, width: 200 };
const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderDecorativeTooltip(): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Tooltip } from './src/components/ui/tooltip.tsx';",
		"const child = createElement('span', null, 'TypeScript/Bun');",
		"console.log(renderToStaticMarkup(createElement(Tooltip, { content: 'TypeScript and Bun' }, child)));",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout);
}

function renderDisclosureTooltip(): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { Tooltip } from './src/components/ui/tooltip.tsx';",
		"const child = createElement('time', { dateTime: '2026-09-01T12:00:00.000Z' }, '2h ago');",
		"console.log(renderToStaticMarkup(createElement(Tooltip, { content: '1 Sep 2026, 07:00', disclosure: true, disclosureLabel: '2h ago. Exact timestamp' }, child)));",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout);
}

describe('tooltip placement', () => {
	test('does not manufacture a keyboard stop for decorative content', () => {
		const html = renderDecorativeTooltip();

		expect(html).not.toContain('tabindex=');
		expect(html).toContain('focus-visible:ring-ring/80');
	});

	test('promotes an explicit disclosure to a named keyboard and touch trigger', () => {
		const html = renderDisclosureTooltip();

		expect(html).toContain('aria-label="2h ago. Exact timestamp"');
		expect(html).toContain('role="button"');
		expect(html).toContain('tabindex="0"');
		expect(html).toContain('decoration-dotted underline-offset-2 max-sm:underline');
		expect(html).toContain('max-sm:min-h-11 max-sm:min-w-11');
		expect(html).toContain('max-sm:items-center max-sm:justify-center');
		expect(html).toContain('<time dateTime="2026-09-01T12:00:00.000Z">2h ago</time>');
		expect(html).not.toContain('title=');
	});

	test('caps requested panel widths by design tier and viewport safe area', async () => {
		const source = await Bun.file(
			resolve(FRONTEND_ROOT, 'src/components/ui/tooltip.tsx'),
		).text();
		expect(source).toContain(
			"const designMaxWidth = { sm: '24rem', wide: '32rem', xs: '20rem' }",
		);
		expect(source).toContain('min(${designMaxWidth}, calc(100vw - 1rem))');
	});

	test('treats viewport and clipping-ancestor exits as detached anchors', () => {
		const visible = { bottom: 120, left: 100, top: 100, width: 40 };

		expect(isTooltipAnchorVisible(visible, viewport)).toBe(true);
		expect(isTooltipAnchorVisible({ ...visible, bottom: -1, top: -21 }, viewport)).toBe(false);
		expect(
			isTooltipAnchorVisible(visible, viewport, [
				{ bottom: 90, left: 0, right: 400, top: 20 },
			]),
		).toBe(false);
		expect(
			isTooltipAnchorVisible(visible, viewport, [
				{ bottom: 110, left: 0, right: 400, top: 20 },
			]),
		).toBe(true);
	});

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
			TOOLTIP_VIEWPORT_MARGIN,
		);
		expect(resolveTooltipPlacement(nearRight, size, viewport, 'top').left).toBe(
			viewport.width - TOOLTIP_VIEWPORT_MARGIN - size.width,
		);
	});
});
