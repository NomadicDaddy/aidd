import type { DependencyGraphViewportMetrics } from './useDependencyGraphViewport.ts';

function visiblePercent(clientSize: number, scrollSize: number): number {
	return scrollSize > 0 ? Math.min(100, Math.round((clientSize / scrollSize) * 100)) : 100;
}

export function DependencyGraphViewportControls({
	metrics,
}: {
	metrics: DependencyGraphViewportMetrics;
	onHorizontalChange: (percent: number) => void;
	onVerticalChange: (percent: number) => void;
}) {
	const scrollsAcross = metrics.scrollWidth > metrics.clientWidth;
	const scrollsDown = metrics.scrollHeight > metrics.clientHeight;
	if (!scrollsAcross && !scrollsDown) return null;
	const visible = visiblePercent(
		metrics.clientHeight * metrics.clientWidth,
		metrics.scrollHeight * metrics.scrollWidth,
	);

	return (
		<p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
			{visible}% visible
		</p>
	);
}
