import type { ReactNode } from 'react';

import type { PortStatusEntry, ProjectSummary } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { formatCount, formatRatio, formatRelativeAge } from '../../lib/formatters.ts';
import { toneSolid } from '../../lib/tones.ts';
import {
	bucketLabels,
	formatAppVersion,
	formatProjectListReportedCost,
	formatProjectTokenCount,
	syncTone,
} from './projects-list-shared.ts';
import { daysSince, specAgeColor, templateVersionColor } from './projects-list-visuals.ts';

function PortDotInline({ listening }: { listening: boolean | null }) {
	if (listening === null) return null;
	return (
		<span
			aria-label={listening ? 'Listening' : 'Not listening'}
			className={`inline-block h-1.5 w-1.5 rounded-full ${
				toneSolid[listening ? 'emerald' : 'red']
			}`}
			title={listening ? 'Listening' : 'Not listening'}
		/>
	);
}

/**
 * One label/value pair on a fixed label track.
 *
 * The values used to begin wherever their label ended, so `Screens: 12` and `Reported cost: $4.10`
 * started 60px apart and the `tabular-nums` on the numbers aligned digits within a value that had no
 * shared left edge to align against. A fixed track is what makes the column the numerals were
 * already dressed for.
 */
function MetricRow({
	children,
	label,
	title,
}: {
	children: ReactNode;
	label: string;
	title?: string | undefined;
}) {
	return (
		<div className="grid grid-cols-[5.5rem_1fr] items-baseline gap-x-2" title={title}>
			<span className="truncate">{label}</span>
			<span className="min-w-0">{children}</span>
		</div>
	);
}

/**
 * The card's attribute list. Version, template version, profile bucket and profile source live here
 * rather than in the badge run above it: they are attributes, not statuses, and as badges they made
 * tone carry four unrelated meanings at once.
 */
export function ProjectCardMetrics({
	portStatus,
	project,
	spernakitTemplateVersion,
}: {
	portStatus: PortStatusEntry | undefined;
	project: ProjectSummary;
	spernakitTemplateVersion: null | string;
}) {
	const { metadata } = project;
	const specDays = daysSince(metadata.specUpdatedAt);
	const fePort = metadata.ports?.frontendPort ?? null;
	const bePort = metadata.ports?.backendPort ?? null;
	const feListening = portStatus?.frontend ?? null;
	const beListening = portStatus?.backend ?? null;
	return (
		// One column below `sm`: at 768 the grid kept two columns of ~100px and wrapped nearly
		// every row onto two lines.
		<div className="grid grid-cols-1 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
			<MetricRow label="Version">
				<span className="font-medium text-foreground">
					{formatAppVersion(metadata.appVersion)}
				</span>
				{metadata.templateVersion ? (
					<>
						{' · '}
						<span
							className={
								templateVersionColor(
									metadata.templateVersion,
									spernakitTemplateVersion,
								) || 'font-medium text-foreground'
							}>
							spk {metadata.templateVersion}
						</span>
					</>
				) : null}
			</MetricRow>
			<MetricRow label="Profile">
				<span className="font-medium text-foreground">
					{bucketLabels[metadata.profile.bucket]}
				</span>{' '}
				({metadata.profile.source})
			</MetricRow>
			<MetricRow label="Interview">
				{metadata.interview
					? formatRatio(metadata.interview.answered, metadata.interview.total)
					: '—'}
			</MetricRow>
			<MetricRow label="Scenarios">{formatCount(metadata.testScenariosCount)}</MetricRow>
			<MetricRow label="Screens">{formatCount(metadata.screenMapRouteCount)}</MetricRow>
			<MetricRow
				label="Reported cost"
				title={`${metadata.usage.totals.runsWithReportedCost}/${metadata.usage.totals.runCount} finalized runs reported cost`}>
				<span className="font-medium text-foreground tabular-nums">
					{formatProjectListReportedCost(metadata.usage.totals)}
				</span>
			</MetricRow>
			<MetricRow
				label="Tokens"
				title={`${metadata.usage.totals.runsWithTokenUsage}/${metadata.usage.totals.runCount} finalized runs reported token usage`}>
				<span className="font-medium text-foreground tabular-nums">
					{formatProjectTokenCount(metadata.usage.totals)}
				</span>
			</MetricRow>
			<MetricRow label="Spec age">
				{specDays !== null ? (
					<span className={`tabular-nums ${specAgeColor(specDays)}`}>{specDays}d</span>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</MetricRow>
			<MetricRow label="Added">
				{metadata.addedAt ? (
					<span title={metadata.addedAt}>{formatRelativeAge(metadata.addedAt)}</span>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</MetricRow>
			<MetricRow label="aidd state">
				<Badge tone={syncTone(metadata.sync.syncState)}>{metadata.sync.syncState}</Badge>
			</MetricRow>
			{fePort !== null || bePort !== null ? (
				<MetricRow label="Ports">
					<span className="font-mono">
						{fePort !== null ? (
							<span className="inline-flex items-center gap-1">
								<PortDotInline listening={feListening} />
								FE:{fePort}
							</span>
						) : null}
						{fePort !== null && bePort !== null ? (
							<span className="mx-1 text-muted-foreground">·</span>
						) : null}
						{bePort !== null ? (
							<span className="inline-flex items-center gap-1">
								<PortDotInline listening={beListening} />
								BE:{bePort}
							</span>
						) : null}
					</span>
				</MetricRow>
			) : null}
		</div>
	);
}
