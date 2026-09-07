export type TooltipSide = 'bottom' | 'top';

export interface TooltipAnchorRect {
	bottom: number;
	left: number;
	top: number;
	width: number;
}

export interface TooltipPlacement {
	left: number;
	side: TooltipSide;
	top: number;
}

export interface TooltipClipRect {
	bottom: number;
	left: number;
	right: number;
	top: number;
}

export interface TooltipSize {
	height: number;
	width: number;
}

export interface TooltipViewportSize {
	height: number;
	width: number;
}

export const TOOLTIP_TRIGGER_GAP = 4;
export const TOOLTIP_VIEWPORT_MARGIN = 8;

/**
 * A fixed tooltip only has an anchor while some part of that anchor is visible. Clamping is for
 * keeping the panel beside a visible edge trigger; it must not pin a detached panel to that edge
 * after the trigger scrolls outside the viewport or one of its clipping ancestors.
 */
export function isTooltipAnchorVisible(
	anchor: TooltipAnchorRect,
	viewport: TooltipViewportSize,
	clipRects: TooltipClipRect[] = [],
): boolean {
	const anchorRight = anchor.left + anchor.width;
	if (
		anchor.width <= 0 ||
		anchor.bottom <= anchor.top ||
		anchor.bottom <= 0 ||
		anchor.top >= viewport.height ||
		anchorRight <= 0 ||
		anchor.left >= viewport.width
	) {
		return false;
	}

	return clipRects.every(
		(rect) =>
			anchor.bottom > rect.top &&
			anchor.top < rect.bottom &&
			anchorRight > rect.left &&
			anchor.left < rect.right,
	);
}

/**
 * Picks the rendered side and top-left corner for a fixed-position tooltip.
 * Flips to the opposite side when the preferred side lacks viewport room (and
 * the other side has it), then clamps both axes so the tooltip never renders
 * past the viewport margin — wide content near an edge slides inward instead
 * of overflowing.
 */
export function resolveTooltipPlacement(
	anchor: TooltipAnchorRect,
	size: TooltipSize,
	viewport: TooltipViewportSize,
	preferredSide: TooltipSide,
): TooltipPlacement {
	const fitsAbove = anchor.top - TOOLTIP_TRIGGER_GAP - size.height >= TOOLTIP_VIEWPORT_MARGIN;
	const fitsBelow =
		anchor.bottom + TOOLTIP_TRIGGER_GAP + size.height <=
		viewport.height - TOOLTIP_VIEWPORT_MARGIN;

	let side = preferredSide;
	if (preferredSide === 'top' && !fitsAbove && fitsBelow) side = 'bottom';
	else if (preferredSide === 'bottom' && !fitsBelow && fitsAbove) side = 'top';

	const unclampedTop =
		side === 'top'
			? anchor.top - TOOLTIP_TRIGGER_GAP - size.height
			: anchor.bottom + TOOLTIP_TRIGGER_GAP;
	const top = Math.max(
		TOOLTIP_VIEWPORT_MARGIN,
		Math.min(unclampedTop, viewport.height - TOOLTIP_VIEWPORT_MARGIN - size.height),
	);

	const centered = anchor.left + anchor.width / 2 - size.width / 2;
	const left = Math.max(
		TOOLTIP_VIEWPORT_MARGIN,
		Math.min(centered, viewport.width - TOOLTIP_VIEWPORT_MARGIN - size.width),
	);

	return { left, side, top };
}
