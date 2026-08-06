import type { TelemetryOutcomeBucket } from 'aidd-shared/runs/outcome';

import { classifyWebRun, classifyWebRunTelemetryBucket } from 'aidd-shared/runs/outcome';
import { Link } from 'react-router';

import type {
	InvocationRecord,
	TelemetryInvocationStatus,
	TelemetryResourceType,
} from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { cn } from '../../lib/cn.ts';
import { formatDate, formatDuration } from '../../lib/formatters.ts';
import { InvocationDetails } from './InvocationDetails.tsx';

/**
 * Source and Project are the two columns that survive being dropped: below the content breakpoint
 * the table pushed Status and Details — the columns an operator is actually scanning — off the
 * right edge, and Project is repeated verbatim inside the Inspect panel of every row.
 *
 * Gated at `xl` rather than the 768px tier it used to use. The main column is 736px wide at 1024
 * and this table wants 812px, so the columns come back only where they actually fit.
 */
const HIDDEN_BELOW_XL = 'hidden xl:table-cell';

const columns: { className?: string; label: string }[] = [
	{ label: 'Resource' },
	{ className: HIDDEN_BELOW_XL, label: 'Source' },
	{ className: HIDDEN_BELOW_XL, label: 'Project' },
	{ label: 'Started' },
	{ label: 'Duration' },
	{ label: 'Status' },
	{ label: 'Details' },
];

function resourceLink(type: TelemetryResourceType, id: string): string {
	if (type === 'recipe') return `/recipes/${id}`;
	if (type === 'run') return '/runs';
	return '/skills';
}

export function InvocationsTable({ invocations }: { invocations: InvocationRecord[] }) {
	if (invocations.length === 0) return <EmptyState>No invocations recorded yet.</EmptyState>;
	return (
		<OverflowScroller ariaLabel="Recent invocations table">
			<table aria-label="Recent invocations" className="w-full text-left text-sm">
				<thead className="border-b border-border bg-muted text-xs text-muted-foreground uppercase">
					<tr>
						{columns.map((column) => (
							<th
								className={cn('px-3 py-2', column.className)}
								key={column.label}
								scope="col">
								{column.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{invocations.map((invocation) => (
						<InvocationRow invocation={invocation} key={invocation.id} />
					))}
				</tbody>
			</table>
		</OverflowScroller>
	);
}

function InvocationRow({ invocation }: { invocation: InvocationRecord }) {
	return (
		<tr className="border-b border-border last:border-0">
			<td className="px-3 py-2">
				{invocation.parentResourceName && invocation.parentResourceType ? (
					<div className="text-xs text-muted-foreground">
						<Link
							className="hover:underline"
							to={resourceLink(
								invocation.parentResourceType,
								invocation.parentResourceId ?? '',
							)}>
							{invocation.parentResourceName}
						</Link>{' '}
						→
					</div>
				) : null}
				<Link
					className="font-medium text-foreground hover:underline"
					to={resourceLink(invocation.resourceType, invocation.resourceId)}>
					{invocation.resourceName}
				</Link>
				<div className="mt-1 flex flex-wrap items-center gap-1.5">
					<span className="text-2xs text-muted-foreground">
						{invocation.resourceType}
					</span>
					<ExecutionIdentityBadges
						backend={invocation.backend}
						model={invocation.model}
					/>
				</div>
			</td>
			<td className={cn('px-3 py-2 text-xs text-foreground', HIDDEN_BELOW_XL)}>
				{invocation.source}
			</td>
			<td className={cn('px-3 py-2 text-xs text-foreground', HIDDEN_BELOW_XL)}>
				{invocation.projectName}
			</td>
			<td className="px-3 py-2 text-xs whitespace-nowrap text-foreground">
				{formatDate(invocation.startedAt)}
			</td>
			<td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
				{invocation.durationMs === null ? '—' : formatDuration(invocation.durationMs)}
			</td>
			<td className="px-3 py-2">
				<InvocationStatusCell invocation={invocation} />
			</td>
			{/* Inherits the row alignment like every other cell: `align-top` floated all 38
			    'Inspect' links about 16px above the rows they belong to. */}
			<td className="px-3 py-2">
				<InvocationDetails invocation={invocation} />
			</td>
		</tr>
	);
}

const statusTones: Record<
	TelemetryInvocationStatus,
	'amber' | 'emerald' | 'neutral' | 'red' | 'teal'
> = {
	completed: 'emerald',
	failed: 'red',
	killed: 'red',
	running: 'teal',
	stopped: 'amber',
};

/**
 * The badge label for a raw invocation status, in the casing `classifyWebRun` uses for a run.
 *
 * Without it the column changed casing with the filter: run-backed rows read "Completed" and rows
 * with no run read "completed", so the same column was title-case at scope=All and lowercase at
 * scope=Recipes.
 */
const statusLabels: Record<TelemetryInvocationStatus, string> = {
	completed: 'Completed',
	failed: 'Failed',
	killed: 'Killed',
	running: 'Running',
	stopped: 'Stopped',
};

/**
 * The tile at the top of the page that this row is counted under.
 *
 * The secondary line used to print the raw invocation status, and the two are not the same thing:
 * an aborted run carries `status: 'failed'` and is tallied under Stopped, so the cell read "failed"
 * in muted text under a neutral grey badge, above a red FAILED tile that does not count it. Derived
 * from the same classifier the aggregator uses, the line names the tile the row actually feeds and
 * cannot contradict it.
 */
const bucketLabels: Record<TelemetryOutcomeBucket, string> = {
	completed: 'Completed',
	failed: 'Failed',
	flagged: 'Flagged',
	killed: 'Killed',
	noWork: 'No work',
	running: 'Running',
	stopped: 'Stopped',
	warnings: 'Warnings',
};

function InvocationStatusCell({ invocation }: { invocation: InvocationRecord }) {
	if (invocation.runStatus) {
		const run = {
			exitCode: invocation.runExitCode,
			status: invocation.runStatus,
			stopReason: invocation.runStopReason,
			summary: invocation.runSummary,
		};
		const outcome = classifyWebRun(run);
		const tally = bucketLabels[classifyWebRunTelemetryBucket(run)];
		// The secondary line earns its place only where the tally says something the badge does
		// not. "Completed" under "Completed" is noise; "Stopped" under "Aborted" is not.
		const echoesBadge = outcome.label.toLowerCase().includes(tally.toLowerCase());
		return (
			<span title={outcome.title}>
				<Badge tone={outcome.tone}>{outcome.label}</Badge>
				{echoesBadge ? null : (
					<span className="mt-0.5 block text-2xs text-muted-foreground">
						Counted under {tally}
					</span>
				)}
			</span>
		);
	}
	return <Badge tone={statusTones[invocation.status]}>{statusLabels[invocation.status]}</Badge>;
}
