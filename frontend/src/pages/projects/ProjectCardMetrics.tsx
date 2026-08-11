import type { ReactNode } from 'react';

import type { PortStatusEntry, ProjectSummary } from '../../api/types.ts';

import { Badge, StatusDot } from '../../components/ui/badge.tsx';
import { formatCount, formatRatio, formatRelativeAge } from '../../lib/formatters.ts';
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
		// The label rides on the wrapper because `StatusDot` is `aria-hidden`, and the wrapper takes
		// `role="img"` so the label is allowed to exist: `aria-label` on a generic `<span>` is
		// ignored by name-from-author rules, so the only carrier of listening-vs-not — a colour —
		// was announced as nothing at all. Every other status on this card is a `ui/badge` with
		// text; this one is a 6px dot and needs the role to say it is a graphic with a name.
		<span
			aria-label={listening ? 'Listening' : 'Not listening'}
			className="inline-flex items-center"
			role="img"
			title={listening ? 'Listening' : 'Not listening'}>
			<StatusDot tone={listening ? 'emerald' : 'red'} />
		</span>
	);
}

/**
 * One label/value pair on a fixed label track.
 *
 * The values used to begin wherever their label ended, so `Screens: 12` and `Reported cost: $4.10`
 * started 60px apart and the `tabular-nums` on the numbers aligned digits within a value that had no
 * shared left edge to align against. A fixed track is what makes the column the numerals were
 * already dressed for.
 *
 * The track is 5rem rather than the 5.5rem it started at, because the value column has to hold a
 * badge. At 1024 the card body is 326px and this list is two columns, so a row gets 157px; 5.5rem
 * left 61px for the value and the `aidd state` badge is `whitespace-nowrap` at 67px for `unknown`.
 * The value span is `min-w-0`, so the grid never saw the badge as a requirement and the badge simply
 * spilled 6px out of the card. Both sides are closed sets — four sync states, eleven hard-coded
 * labels — so 5rem is exact rather than lucky: the widest label, `Reported cost`, needs 77.3px, and
 * it truncates rather than overflowing if a fallback font ever makes it wider.
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
		<div className="grid grid-cols-[5rem_1fr] items-baseline gap-x-2" title={title}>
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
