import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';

import type {
	PortStatusEntry,
	ProjectArtifactCheckCounts,
	ProjectPorts,
	ProjectSummary,
	ProjectUsageDailyTokens,
} from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { formatCompactNumber, percent } from '../../lib/formatters.ts';
import { toneSolid } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { artifactTone } from './projects-list-shared.ts';
import { featureProgressColor } from './projects-list-visuals.ts';

function PortDot({ listening }: { listening: boolean | null }) {
	if (listening === null) return null;
	return (
		<span
			aria-label={listening ? 'Port listening' : 'Port not listening'}
			className={`inline-block h-2 w-2 rounded-full ${
				toneSolid[listening ? 'emerald' : 'red']
			}`}
			title={listening ? 'Listening' : 'Not listening'}
		/>
	);
}

const SPARKLINE_WIDTH = 64;
const SPARKLINE_HEIGHT = 18;
const SPARKLINE_PADDING = 1;

function sparklinePath(points: ProjectUsageDailyTokens[]): string {
	const maximum = Math.max(0, ...points.map((point) => point.totalTokens));
	const usableWidth = SPARKLINE_WIDTH - SPARKLINE_PADDING * 2;
	const usableHeight = SPARKLINE_HEIGHT - SPARKLINE_PADDING * 2;
	return points
		.map((point, index) => {
			const x = SPARKLINE_PADDING + (index / Math.max(1, points.length - 1)) * usableWidth;
			const y =
				maximum === 0
					? SPARKLINE_HEIGHT - SPARKLINE_PADDING
					: SPARKLINE_PADDING + (1 - point.totalTokens / maximum) * usableHeight;
			return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
		})
		.join(' ');
}

export function TokenSparkline({ points }: { points: ProjectUsageDailyTokens[] }) {
	const sevenDays = points.slice(-7);
	if (sevenDays.length === 0) return null;
	const total = sevenDays.reduce((sum, point) => sum + point.totalTokens, 0);
	const details = sevenDays
		.map((point) => `${point.date}: ${point.totalTokens.toLocaleString()} tokens`)
		.join(' · ');
	return (
		<svg
			aria-label={`Tokens over the past 7 days: ${formatCompactNumber(total)} total`}
			className={`block h-[18px] w-16 ${
				total > 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-muted-foreground'
			}`}
			role="img"
			viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}>
			<title>{details}</title>
			<path
				d={sparklinePath(sevenDays)}
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function PortLabel({
	collision,
	listening,
	port,
}: {
	collision: boolean;
	listening: boolean | null;
	port: null | number;
}) {
	if (port === null) return <span className="text-muted-foreground">—</span>;
	const cls = collision ? 'font-semibold text-amber-700 dark:text-amber-400' : '';
	if (listening === true) {
		return (
			<a
				className={`underline-offset-2 hover:underline ${cls} ${touchTargetTextClass}`}
				href={`http://localhost:${port}/`}
				onClick={(event) => event.stopPropagation()}
				rel="noreferrer"
				target="_blank">
				{port}
			</a>
		);
	}
	return <span className={cls}>{port}</span>;
}

export function PortsCell({
	backendCollision,
	collisionPeers,
	frontendCollision,
	ports,
	status,
}: {
	backendCollision: boolean;
	collisionPeers: string[];
	frontendCollision: boolean;
	ports: null | ProjectPorts;
	status: PortStatusEntry | undefined;
}) {
	if (!ports || (ports.frontendPort === null && ports.backendPort === null)) {
		return <span className="text-muted-foreground">—</span>;
	}
	const hasCollision = frontendCollision || backendCollision;
	const collisionLabel = hasCollision
		? `Port collision with ${collisionPeers.join(', ')}. These projects cannot run simultaneously.`
		: undefined;
	return (
		<span className="inline-flex flex-wrap items-center gap-1.5 font-mono text-xs whitespace-nowrap">
			<span className="inline-flex items-center gap-1">
				<PortDot listening={status?.frontend ?? null} />
				<span>FE:</span>
				<PortLabel
					collision={frontendCollision}
					listening={status?.frontend ?? null}
					port={ports.frontendPort}
				/>
			</span>
			<span className="inline-flex items-center gap-1">
				<PortDot listening={status?.backend ?? null} />
				<span>BE:</span>
				<PortLabel
					collision={backendCollision}
					listening={status?.backend ?? null}
					port={ports.backendPort}
				/>
			</span>
			{hasCollision ? (
				<span aria-label={collisionLabel} role="img" title={collisionLabel}>
					<AlertTriangle
						aria-hidden="true"
						className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
					/>
				</span>
			) : null}
		</span>
	);
}

export function FeatureProgressCell({
	failing,
	passing,
	total,
}: {
	failing: number;
	passing: number;
	total: number;
}) {
	const pct = percent(passing, total);
	return (
		<div className="min-w-[6rem] space-y-1">
			<div className="text-xs tabular-nums">
				{passing}/{total}
				{failing > 0 ? (
					<span className="ml-1 text-amber-700 dark:text-amber-400">({failing})</span>
				) : null}
			</div>
			<div
				aria-label={`${pct}% passing`}
				className="h-1.5 overflow-hidden rounded-full bg-muted">
				{total > 0 ? (
					<div
						className={`h-full ${featureProgressColor(pct)}`}
						style={{ width: `${pct}%` }}
					/>
				) : null}
			</div>
		</div>
	);
}

export function ArtifactCell({
	health,
	summary,
}: {
	health: ProjectSummary['artifactHealth'];
	summary: null | ProjectArtifactCheckCounts;
}) {
	const tooltip = summary
		? `${summary.fresh} fresh · ${summary.stale} stale · ${summary.missing} missing`
		: undefined;
	return (
		<span title={tooltip}>
			<Badge tone={artifactTone[health]}>{health}</Badge>
		</span>
	);
}
