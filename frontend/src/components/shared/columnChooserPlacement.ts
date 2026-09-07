interface RectangleEdges {
	bottom: number;
	left: number;
	right: number;
	top: number;
}

const PANEL_GAP_PX = 4;
const VIEWPORT_GUTTER_PX = 8;

export function resolveColumnChooserPlacement(
	anchor: RectangleEdges,
	panel: { height: number; width: number },
	viewport: { height: number; width: number },
): { left: number; top: number } {
	const maximumLeft = Math.max(
		VIEWPORT_GUTTER_PX,
		viewport.width - panel.width - VIEWPORT_GUTTER_PX,
	);
	const left = Math.min(Math.max(anchor.right - panel.width, VIEWPORT_GUTTER_PX), maximumLeft);
	const below = anchor.bottom + PANEL_GAP_PX;
	const top =
		below + panel.height <= viewport.height - VIEWPORT_GUTTER_PX
			? below
			: Math.max(VIEWPORT_GUTTER_PX, anchor.top - panel.height - PANEL_GAP_PX);

	return { left, top };
}
