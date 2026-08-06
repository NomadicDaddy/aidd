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
import { formatDate, formatDuration } from '../../lib/formatters.ts';
import { InvocationDetails } from './InvocationDetails.tsx';

const columns = ['Resource', 'Source', 'Project', 'Started', 'Duration', 'Status', 'Details'];

function resourceLink(type: TelemetryResourceType, id: string): string {
	if (type === 'recipe') return `/recipes/${id}`;
	if (type === 'run') return '/runs';
	return '/skills';
}

export function InvocationsTable({ invocations }: { invocations: InvocationRecord[] }) {
	if (invocations.length === 0) return <EmptyState>No invocations recorded yet.</EmptyState>;
	return (
		<>
			{/* Seven columns want 812px and the mobile content column is 324px, so 60% of this
			    table was off-screen at `scrollLeft=0` with Status and Details — the two an operator
			    is actually scanning — entirely past the edge. The scroller was already here and was
			    never the fix: a scrollport you have to drag through to reach the point of the row
			    is contained, not usable. Dropping Source and Project below the breakpoint was the
			    stack standing in for itself; with a real stack they come back. */}
			<OverflowScroller ariaLabel="Recent invocations table" className="hidden xl:block">
				<table aria-label="Recent invocations" className="w-full text-left text-sm">
					<thead className="border-b border-border bg-muted text-xs text-muted-foreground uppercase">
						<tr>
							{columns.map((column) => (
								<th className="px-3 py-2" key={column} scope="col">
									{column}
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
			<div
				aria-label="Recent invocations"
				className="flex flex-col divide-y divide-border xl:hidden"
				role="list">
				{invocations.map((invocation) => (
					<InvocationCard invocation={invocation} key={invocation.id} />
				))}
			</div>
		</>
	);
}

function InvocationCard({ invocation }: { invocation: InvocationRecord }) {
	return (
		<div className="flex flex-col gap-2 py-3" role="listitem">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<InvocationResource invocation={invocation} />
				<InvocationStatusCell invocation={invocation} />
			</div>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				<span className="text-foreground">{invocation.source}</span>
				<span aria-hidden="true">·</span>
				<span className="min-w-0 truncate">{invocation.projectName}</span>
				<span aria-hidden="true">·</span>
				<span className="whitespace-nowrap">{formatDate(invocation.startedAt)}</span>
				<span aria-hidden="true">·</span>
				<span className="whitespace-nowrap tabular-nums">
					{invocation.durationMs === null ? '—' : formatDuration(invocation.durationMs)}
				</span>
			</div>
			<InvocationDetails invocation={invocation} />
		</div>
	);
}

/** The identity of the row, rendered the same in the table cell and on the card. */
function InvocationResource({ invocation }: { invocation: InvocationRecord }) {
	return (
		<div className="min-w-0">
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
				<span className="text-2xs text-muted-foreground">{invocation.resourceType}</span>
				<ExecutionIdentityBadges backend={invocation.backend} model={invocation.model} />
			</div>
		</div>
	);
}

function InvocationRow({ invocation }: { invocation: InvocationRecord }) {
	return (
		<tr className="border-b border-border last:border-0">
			<td className="px-3 py-2">
				<InvocationResource invocation={invocation} />
			</td>
			<td className="px-3 py-2 text-xs text-foreground">{invocation.source}</td>
			<td className="px-3 py-2 text-xs text-foreground">{invocation.projectName}</td>
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
