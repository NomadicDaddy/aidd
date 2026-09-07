/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';

import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as ZoomIn } from 'lucide-react/dist/esm/icons/zoom-in';
import { default as ZoomOut } from 'lucide-react/dist/esm/icons/zoom-out';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button, IconButton } from '../../../components/ui/button.tsx';
import { cn } from '../../../lib/cn.ts';
import { humanizeEnum } from '../../../lib/formatters.ts';
import { sourceSolid } from '../../../lib/series.ts';
import { toneBorder, toneSolid } from '../../../lib/tones.ts';
import { sectionCaptionClass } from '../../../lib/typography.ts';
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

export function sourceBadgeTone(
	source: FeatureDependencyNode['source'],
): 'amber' | 'neutral' | 'red' {
	if (source === 'audit') return 'amber';
	if (source === 'remediation') return 'red';
	return 'neutral';
}

export function GraphSourceLegend({ action }: { action?: ReactNode }) {
	const sources = ['feature', 'audit', 'remediation'] as const;
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
			<div
				aria-label="Node source legend"
				className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
				role="list">
				{sources.map((source) => (
					<span className="inline-flex items-center gap-1.5" key={source} role="listitem">
						<span
							aria-hidden="true"
							className={`h-4 w-1 rounded-full ${sourceSolid[source]}`}
						/>
						{sourceLabels[source]}
					</span>
				))}
				<span className="inline-flex items-center gap-1.5" role="listitem">
					<span aria-hidden="true" className="font-mono text-foreground">
						A → B
					</span>
					A must ship before B
				</span>
				<span className="inline-flex items-center gap-1.5" role="listitem">
					<span aria-hidden="true" className="h-px w-5 bg-accent" />
					Selected path
				</span>
				<span className="inline-flex items-center gap-1.5" role="listitem">
					<span aria-hidden="true" className={`h-px w-5 ${toneSolid.amber}`} />
					Blocking prerequisite
				</span>
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
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
	hasError,
	isDimmed,
	isRelated,
	isSelected,
	node,
	onSelect,
}: {
	hasError: boolean;
	isDimmed: boolean;
	isRelated: boolean;
	isSelected: boolean;
	node: FeatureDependencyNode;
	onSelect: (directory: string) => void;
}) {
	return (
		<button
			aria-pressed={isSelected}
			className={cn(
				'absolute min-h-11 overflow-hidden rounded-md border border-border bg-card p-3 text-left shadow-sm transition-[border-color,background-color,box-shadow,opacity,filter] duration-150',
				'hover:border-accent hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
				isDimmed && 'opacity-25 saturate-50 hover:opacity-60',
				isRelated && 'border-accent/60 bg-accent-muted opacity-100 saturate-100',
				isSelected &&
					'z-10 border-accent bg-accent-muted opacity-100 shadow-md ring-2 ring-ring/40 saturate-100',
				hasError && toneBorder.red,
			)}
			onClick={() => onSelect(node.directory)}
			style={{
				height: GRAPH_NODE_HEIGHT,
				left: node.x,
				top: node.y,
				width: GRAPH_NODE_WIDTH,
			}}
			type="button">
			<span className="sr-only">{sourceLabels[node.source]} source. </span>
			<span
				aria-hidden="true"
				className={`absolute inset-y-0 left-0 w-1 ${sourceSolid[node.source]}`}
			/>
			{/* Both lines truncate, so neither wraps into the other's row and the box height stays
			    the constant the layout placed the node at. `title` is what makes the ellipsis
			    honest: an id cut to `abort-completion-requires-…` is unrecoverable otherwise, and
			    it is the only thing that names the node. */}
			<p className="truncate text-sm font-semibold text-foreground" title={node.title}>
				{node.title}
			</p>
			<div className="mt-1.5 flex items-center gap-2">
				<Badge className="shrink-0" tone={statusTone(node.status)}>
					{humanizeEnum(node.status)}
				</Badge>
				<span className="font-mono text-xs text-muted-foreground">L{node.layer}</span>
			</div>
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
			<h3 className={sectionCaptionClass}>{title}</h3>
			{directories.length === 0 ? (
				<p className="mt-2 text-sm text-muted-foreground">None</p>
			) : (
				<ul className="mt-2 space-y-1.5">
					{directories.map((directory) => {
						const node = nodeByDirectory.get(directory);
						return (
							<li className="min-w-0" key={directory}>
								<button
									className="w-full min-w-0 rounded-md border border-border bg-muted px-3 py-2 text-left text-sm text-foreground hover:border-accent hover:bg-accent-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									onClick={() => onSelect(directory)}
									type="button">
									<span
										className="block truncate font-medium"
										title={node?.title ?? directory}>
										{node?.title ?? directory}
									</span>
									<span
										className="block truncate font-mono text-xs text-muted-foreground"
										title={directory}>
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

// The labelled select for this graph's filters is `components/shared/FilterToolbar.tsx`, with the
// other five toolbars — not a private copy here.

export function GraphDiagnostics({
	graph,
	visibleGraph,
}: {
	graph: ReturnType<typeof buildFeatureDependencyGraph>;
	visibleGraph: ReturnType<typeof buildFeatureDependencyGraph>;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Badge tone={visibleGraph.edges.length < graph.edges.length ? 'amber' : 'neutral'}>
				{visibleGraph.edges.length} of {graph.edges.length} links on canvas
			</Badge>
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
	effectiveZoom,
	minimumZoom = GRAPH_ZOOM_MIN,
	onReset,
	onZoomIn,
	onZoomOut,
	zoom,
}: {
	effectiveZoom: number;
	minimumZoom?: number;
	onReset: () => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	zoom: number;
}) {
	return (
		<div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
			<IconButton
				ariaLabel="Zoom out"
				disabled={zoom <= minimumZoom + 0.005}
				onClick={onZoomOut}
				variant="ghost">
				<ZoomOut className="h-4 w-4" />
			</IconButton>
			<Button
				aria-label="Reset zoom"
				className="min-w-20 font-mono"
				disabled={Math.abs(effectiveZoom - GRAPH_ZOOM_DEFAULT) < 0.005}
				onClick={onReset}
				size="compact"
				title="Reset zoom"
				variant="ghost">
				<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
				{zoomLabel(effectiveZoom)}
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
