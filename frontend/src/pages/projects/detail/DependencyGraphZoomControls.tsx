import {
	GRAPH_ZOOM_MAX,
	GRAPH_ZOOM_MIN,
	GRAPH_ZOOM_STEP,
	GraphZoomControls,
	nextGraphZoom,
} from './dependencyGraphComponents.tsx';
import { GRAPH_MIN_READABLE_SCALE } from './dependencyGraphLayout.ts';

export function DependencyGraphZoomControls({
	effectiveZoom,
	onChange,
	viewportFit,
	zoom,
}: {
	effectiveZoom: number;
	onChange: (zoom: number) => void;
	viewportFit: number;
	zoom: number;
}) {
	const minimumZoom = Math.min(
		GRAPH_ZOOM_MAX,
		Math.max(GRAPH_ZOOM_MIN, GRAPH_MIN_READABLE_SCALE / viewportFit),
	);
	return (
		<GraphZoomControls
			effectiveZoom={effectiveZoom}
			minimumZoom={minimumZoom}
			onReset={() =>
				onChange(Math.min(GRAPH_ZOOM_MAX, Math.max(GRAPH_ZOOM_MIN, 1 / viewportFit)))
			}
			onZoomIn={() => onChange(nextGraphZoom(zoom, GRAPH_ZOOM_STEP))}
			onZoomOut={() => onChange(Math.max(minimumZoom, nextGraphZoom(zoom, -GRAPH_ZOOM_STEP)))}
			zoom={zoom}
		/>
	);
}
