/* eslint-disable react-refresh/only-export-components */
import { default as ZoomIn } from 'lucide-react/dist/esm/icons/zoom-in';
import { default as ZoomOut } from 'lucide-react/dist/esm/icons/zoom-out';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button, IconButton } from '../../../components/ui/button.tsx';
import { cn } from '../../../lib/cn.ts';
import { humanizeEnum } from '../../../lib/formatters.ts';
import {
	type buildFeatureDependencyGraph,
	type FeatureDependencyNode,
	GRAPH_NODE_HEIGHT,
	GRAPH_NODE_WIDTH,
} from './dependencyGraphUtils.ts';
import { statusTone } from './shared.ts';

export const GRAPH_ZOOM_DEFAULT = 1;
export const GRAPH_ZOOM_MAX = 1.6;
export const GRAPH_ZOOM_MIN = 0.5;
export const GRAPH_ZOOM_STEP = 0.1;

export const sourceLabels: Record<FeatureDependencyNode['source'], string> = {
	audit: 'Audit',
	feature: 'Feature',
	remediation: 'Remediation',
};

export function nextGraphZoom(current: number, delta: number): number {
	return Number(Math.min(GRAPH_ZOOM_MAX, Math.max(GRAPH_ZOOM_MIN, current + delta)).toFixed(2));
}

function zoomLabel(zoom: number): string {
	return `${Math.round(zoom * 100)}%`;
}

function nodeSourceRailClass(source: FeatureDependencyNode['source']): string {
	if (source === 'audit') return 'bg-amber-500';
	if (source === 'remediation') return 'bg-red-500';
	return 'bg-violet-500';
}

export function sourceBadgeTone(
	source: FeatureDependencyNode['source'],
): 'amber' | 'red' | 'violet' {
	if (source === 'audit') return 'amber';
	if (source === 'remediation') return 'red';
	return 'violet';
}

export function GraphSourceLegend() {
	const sources = ['feature', 'audit', 'remediation'] as const;
	return (
		<div
			aria-label="Node source legend"
			className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground"
			role="list">
			{sources.map((source) => (
				<span className="inline-flex items-center gap-1.5" key={source} role="listitem">
					<span
						aria-hidden="true"
						className={`h-4 w-1 rounded-full ${nodeSourceRailClass(source)}`}
					/>
					{sourceLabels[source]}
				</span>
			))}
		</div>
	);
}

export function edgePath(source: FeatureDependencyNode, target: FeatureDependencyNode): string {
	const sourceX = source.x + GRAPH_NODE_WIDTH;
	const sourceY = source.y + GRAPH_NODE_HEIGHT / 2;
	const targetX = target.x;
	const targetY = target.y + GRAPH_NODE_HEIGHT / 2;
	const bend = Math.max(56, Math.abs(targetX - sourceX) / 2);
	return `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${
		targetX - bend
	} ${targetY}, ${targetX} ${targetY}`;
}

export function GraphNodeButton({
	isDimmed,
	isRelated,
	isSelected,
	node,
	onSelect,
}: {
	isDimmed: boolean;
	isRelated: boolean;
	isSelected: boolean;
	node: FeatureDependencyNode;
	onSelect: (directory: string) => void;
}) {
	return (
		<button
			className={cn(
				'absolute min-h-11 overflow-hidden rounded-md border border-border bg-card p-3 text-left shadow-sm transition-[border-color,background-color,box-shadow,opacity,filter] duration-150',
				'hover:border-accent hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
				isDimmed && 'opacity-25 saturate-50 hover:opacity-60',
				isRelated && 'border-accent/60 bg-accent-muted opacity-100 saturate-100',
				isSelected &&
					'z-10 border-accent bg-accent-muted opacity-100 shadow-md ring-2 ring-ring/40 saturate-100',
			)}
			onClick={() => onSelect(node.directory)}
			style={{
				height: GRAPH_NODE_HEIGHT,
				left: node.x,
				top: node.y,
				width: GRAPH_NODE_WIDTH,
			}}
			type="button">
			<span
				aria-hidden="true"
				className={`absolute inset-y-0 left-0 w-1 ${nodeSourceRailClass(node.source)}`}
			/>
			<div className="flex items-center justify-between gap-2">
				<Badge className="shrink-0" tone={statusTone(node.status)}>
					{humanizeEnum(node.status)}
				</Badge>
				<span className="font-mono text-xs text-muted-foreground">L{node.layer}</span>
			</div>
			{/* Both lines truncate, so neither wraps into the other's row and the box height stays
			    the constant the layout placed the node at. `title` is what makes the ellipsis
			    honest: an id cut to `abort-completion-requires-…` is unrecoverable otherwise, and
			    it is the only thing that names the node. */}
			<p className="mt-2 truncate text-sm font-semibold text-foreground" title={node.title}>
				{node.title}
			</p>
			<p
				className="mt-1 truncate font-mono text-xs text-muted-foreground"
				title={node.directory}>
				{node.directory}
			</p>
		</button>
	);
}

export function DependencyList({
	directories,
	nodeByDirectory,
	onSelect,
	title,
}: {
	directories: string[];
	nodeByDirectory: Map<string, FeatureDependencyNode>;
	onSelect: (directory: string) => void;
	title: string;
}) {
	return (
		<section>
			<h3 className="text-xs font-semibold text-muted-foreground uppercase">{title}</h3>
			{directories.length === 0 ? (
				<p className="mt-2 text-sm text-muted-foreground">None</p>
			) : (
				<ul className="mt-2 space-y-1.5">
					{directories.map((directory) => {
						const node = nodeByDirectory.get(directory);
						return (
							<li key={directory}>
								<button
									className="w-full rounded-md border border-border bg-muted px-3 py-2 text-left text-sm text-foreground hover:border-accent hover:bg-accent-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									onClick={() => onSelect(directory)}
									type="button">
									<span className="block truncate font-medium">
										{node?.title ?? directory}
									</span>
									<span className="block truncate font-mono text-xs text-muted-foreground">
										{directory}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

// `FilterSelect` used to live here, a fourth private copy of a labelled select. It is
// `components/shared/FilterToolbar.tsx` now, with the other five toolbars.

export function GraphDiagnostics({
	graph,
}: {
	graph: ReturnType<typeof buildFeatureDependencyGraph>;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Badge tone="neutral">{graph.nodes.length} features</Badge>
			<Badge tone="neutral">{graph.edges.length} links</Badge>
			{/* "N visible" was here. The toolbar's `role="status"` readout says it, once, and says
			    it out loud; a badge that changes tone says it only to whoever is watching. */}
			{graph.cycles.length > 0 ? (
				<Badge tone="red">{graph.cycles.length} cycles</Badge>
			) : null}
			{graph.unresolvedDependencies.length > 0 ? (
				<Badge tone="red">{graph.unresolvedDependencies.length} unresolved</Badge>
			) : null}
		</div>
	);
}

export function GraphZoomControls({
	onReset,
	onZoomIn,
	onZoomOut,
	zoom,
}: {
	onReset: () => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	zoom: number;
}) {
	return (
		<div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
			<IconButton
				ariaLabel="Zoom out"
				disabled={zoom <= GRAPH_ZOOM_MIN}
				onClick={onZoomOut}
				variant="ghost">
				<ZoomOut className="h-4 w-4" />
			</IconButton>
			<Button
				aria-label="Reset zoom"
				className="min-w-16 font-mono"
				disabled={zoom === GRAPH_ZOOM_DEFAULT}
				onClick={onReset}
				size="compact"
				title="Reset zoom"
				variant="ghost">
				{zoomLabel(zoom)}
			</Button>
			<IconButton
				ariaLabel="Zoom in"
				disabled={zoom >= GRAPH_ZOOM_MAX}
				onClick={onZoomIn}
				variant="ghost">
				<ZoomIn className="h-4 w-4" />
			</IconButton>
		</div>
	);
}
