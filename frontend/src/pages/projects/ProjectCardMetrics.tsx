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
			<div>
				Version:{' '}
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
			</div>
			<div>
				Profile:{' '}
				<span className="font-medium text-foreground">
					{bucketLabels[metadata.profile.bucket]}
				</span>{' '}
				({metadata.profile.source})
			</div>
			<div>
				Interview:{' '}
				{metadata.interview
					? formatRatio(metadata.interview.answered, metadata.interview.total)
					: '—'}
			</div>
			<div>Scenarios: {formatCount(metadata.testScenariosCount)}</div>
			<div>Screens: {formatCount(metadata.screenMapRouteCount)}</div>
			<div
				title={`${metadata.usage.totals.runsWithReportedCost}/${metadata.usage.totals.runCount} finalized runs reported cost`}>
				Reported cost:{' '}
				<span className="font-medium text-foreground tabular-nums">
					{formatProjectListReportedCost(metadata.usage.totals)}
				</span>
			</div>
			<div
				title={`${metadata.usage.totals.runsWithTokenUsage}/${metadata.usage.totals.runCount} finalized runs reported token usage`}>
				Tokens:{' '}
				<span className="font-medium text-foreground tabular-nums">
					{formatProjectTokenCount(metadata.usage.totals)}
				</span>
			</div>
			<div>
				Spec age:{' '}
				{specDays !== null ? (
					<span className={specAgeColor(specDays)}>{specDays}d</span>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</div>
			<div>
				Added:{' '}
				{metadata.addedAt ? (
					<span title={metadata.addedAt}>{formatRelativeAge(metadata.addedAt)}</span>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</div>
			<div>
				aidd state:{' '}
				<Badge tone={syncTone(metadata.sync.syncState)}>{metadata.sync.syncState}</Badge>
			</div>
			{fePort !== null || bePort !== null ? (
				<div className="font-mono">
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
				</div>
			) : null}
		</div>
	);
}
