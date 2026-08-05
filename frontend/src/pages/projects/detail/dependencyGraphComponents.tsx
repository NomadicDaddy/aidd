/* eslint-disable react-refresh/only-export-components */
import { default as ZoomIn } from 'lucide-react/dist/esm/icons/zoom-in';
import { default as ZoomOut } from 'lucide-react/dist/esm/icons/zoom-out';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button, IconButton } from '../../../components/ui/button.tsx';
import { cn } from '../../../lib/cn.ts';
import { fieldLabelClass, selectClass } from '../../../lib/formStyles.ts';
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

function nodeSourceClass(source: FeatureDependencyNode['source']): string {
	if (source === 'audit') return 'border-l-amber-500';
	if (source === 'remediation') return 'border-l-red-500';
	return 'border-l-teal-500';
}

export function sourceBadgeTone(
	source: FeatureDependencyNode['source'],
): 'amber' | 'neutral' | 'red' | 'teal' {
	if (source === 'audit') return 'amber';
	if (source === 'remediation') return 'red';
	return 'teal';
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
			aria-label={`Select ${node.directory}`}
			className={cn(
				'absolute overflow-hidden rounded-md border border-l-4 border-border bg-card p-3 text-left shadow-sm transition-[border-color,background-color,box-shadow,opacity,filter] duration-150',
				'hover:border-accent hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
				nodeSourceClass(node.source),
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
			<div className="flex items-center justify-between gap-2">
				<Badge className="shrink-0" tone={statusTone(node.status)}>
					{node.status}
				</Badge>
				<span className="font-mono text-xs text-muted-foreground">L{node.layer}</span>
			</div>
			<p className="mt-2 truncate text-sm font-semibold text-foreground">{node.title}</p>
			<p className="mt-1 truncate font-mono text-xs text-muted-foreground">
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

export function FilterSelect({
	label,
	onChange,
	options,
	value,
}: {
	label: string;
	onChange: (value: string) => void;
	options: { label: string; value: string }[];
	value: string;
}) {
	return (
		<label className="grid gap-1">
			<span className={fieldLabelClass}>{label}</span>
			<select
				className={`${selectClass} w-full`}
				onChange={(event) => onChange(event.target.value)}
				value={value}>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}

export function GraphDiagnostics({
	graph,
	visibleCount,
}: {
	graph: ReturnType<typeof buildFeatureDependencyGraph>;
	visibleCount: number;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Badge tone="neutral">{graph.nodes.length} features</Badge>
			<Badge tone="neutral">{graph.edges.length} links</Badge>
			<Badge tone={visibleCount === graph.nodes.length ? 'neutral' : 'amber'}>
				{visibleCount} visible
			</Badge>
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
