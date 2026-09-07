import {
	classifyWebRun,
	classifyWebRunTelemetryBucket,
	executionStatusPresentation,
	telemetryOutcomePresentation,
} from 'aidd-shared/runs/outcome';
import { useState } from 'react';

import type { InvocationRecord } from '../../api/types.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Tooltip } from '../../components/ui/tooltip.tsx';
import { formatDate, formatDuration } from '../../lib/formatters.ts';
import { tableHeadClass } from '../../lib/tableStyles.ts';
import { machineLabelClass } from '../../lib/typography.ts';
import {
	inspectTriggerClass,
	InvocationDetails,
	InvocationDetailsPanel,
} from './InvocationDetails.tsx';
import { invocationSourceLabel } from './invocationSource.ts';
import {
	emptyTelemetryResourceAvailability,
	type TelemetryResourceAvailability,
} from './resourceLink.ts';
import { TelemetryResourceName } from './TelemetryResourceName.tsx';

/**
 * The seven columns, with a width for the five that hold something bounded.
 *
 * `table-auto` distributes by content, and the content here is lopsided: Resource carries a name, a
 * parent line and two identity badges, so it took 42% of the table while Duration — which never
 * prints more than seven characters — took 14% and Status, which prints a badge and sometimes a
 * second line under it, was squeezed until 'Counted under Warnings' wrapped to three lines. Fixing
 * the five bounded columns lets Resource and Project absorb the remainder, which is the only place
 * variable-length content actually lives.
 */
const columns: readonly { className: string; label: string }[] = [
	{ className: '', label: 'Resource' },
	{ className: 'w-28 whitespace-nowrap', label: 'Source' },
	{ className: 'w-56', label: 'Project' },
	{ className: 'w-40', label: 'Started' },
	{ className: 'w-28', label: 'Duration' },
	{ className: 'w-48', label: 'Status' },
	{ className: 'w-24', label: 'Details' },
];

interface InvocationResourceProps {
	availableResources: TelemetryResourceAvailability;
	invocation: InvocationRecord;
}

export function InvocationsTable({
	availableResources = emptyTelemetryResourceAvailability,
	invocations,
}: {
	availableResources?: TelemetryResourceAvailability;
	invocations: InvocationRecord[];
}) {
	if (invocations.length === 0) return <EmptyState>No invocations recorded yet.</EmptyState>;
	return (
		<>
			{/* Seven columns want 812px and the mobile content column is 324px, so 60% of this
			    table was off-screen at `scrollLeft=0` with Status and Details — the two an operator
			    is actually scanning — entirely past the edge. The scroller was already here and was
			    never the fix: a scrollport you have to drag through to reach the point of the row
			    is contained, not usable. Dropping Source and Project below the breakpoint was the
			    stack standing in for itself; with a real stack they come back. */}
			<OverflowScroller
				ariaLabel="Recent invocations table"
				className="hidden xl:block"
				scrollerClassName="max-h-[calc(100dvh-16rem)]">
				<table
					aria-label="Recent invocations"
					className="w-full min-w-[64rem] table-fixed text-left text-sm">
					<thead className={tableHeadClass}>
						<tr>
							{columns.map((column) => (
								<th
									className={`sticky top-0 z-10 bg-muted px-3 py-2 ${column.className}`}
									key={column.label}
									scope="col">
									{column.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{invocations.map((invocation) => (
							<InvocationRow
								availableResources={availableResources}
								invocation={invocation}
								key={invocation.id}
							/>
						))}
					</tbody>
				</table>
			</OverflowScroller>
			<div
				aria-label="Recent invocations"
				className="flex flex-col divide-y divide-border xl:hidden"
				role="list">
				{invocations.map((invocation) => (
					<InvocationCard
						availableResources={availableResources}
						invocation={invocation}
						key={invocation.id}
					/>
				))}
			</div>
		</>
	);
}

function InvocationCard({ availableResources, invocation }: InvocationResourceProps) {
	return (
		<div className="flex flex-col gap-2 py-3" role="listitem">
			<div className="min-w-0">
				<InvocationResource
					availableResources={availableResources}
					invocation={invocation}
				/>
			</div>
			<div className="flex min-h-9 items-start">
				<InvocationStatusCell invocation={invocation} />
			</div>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				<span className="text-foreground">{invocationSourceLabel(invocation.source)}</span>
				<span aria-hidden="true">·</span>
				<span className={machineLabelClass} title={invocation.projectName}>
					{invocation.projectName}
				</span>
				<span aria-hidden="true">·</span>
				<span className="whitespace-nowrap tabular-nums">
					{formatDate(invocation.startedAt)}
				</span>
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
function InvocationResource({ availableResources, invocation }: InvocationResourceProps) {
	return (
		<div className="min-w-0 flex-1">
			{invocation.parentResourceName && invocation.parentResourceType ? (
				<div className="min-w-0 text-xs text-muted-foreground">
					<TelemetryResourceName
						availableResources={availableResources}
						className="text-muted-foreground"
						id={invocation.parentResourceId ?? ''}
						name={invocation.parentResourceName}
						type={invocation.parentResourceType}
					/>{' '}
					→
				</div>
			) : null}
			<TelemetryResourceName
				availableResources={availableResources}
				className="font-medium text-foreground"
				id={invocation.resourceId}
				name={invocation.resourceName}
				type={invocation.resourceType}
			/>
			<div className="mt-1 flex flex-wrap items-center gap-1.5">
				<span className="text-2xs text-muted-foreground">{invocation.resourceType}</span>
				<ExecutionIdentityBadges backend={invocation.backend} model={invocation.model} />
			</div>
		</div>
	);
}

/**
 * One invocation, plus the row its detail panel opens into.
 *
 * The panel does not open inside the Details cell, which is the last of seven: a 672px panel in a
 * column sized for the word 'Inspect' widens the table to 1518px inside a 1236px scroller, so
 * opening one row scrolls every other row's Resource column off the left edge and the operator has
 * to drag back and forth between the row they picked and the panel they opened. A full-width row
 * underneath is the shape a table has for this. It costs a `useState` per row, which is what the
 * cheaper `<details>` would save, and buys back the whole horizontal axis.
 *
 * `<details>` cannot span a table row — its content has to be a child of the element that holds the
 * summary — so the trigger here is a button carrying the state explicitly. The card stack below
 * `xl` still uses the `<details>`; both wear the same trigger classes and the same chevron.
 */
function InvocationRow({ availableResources, invocation }: InvocationResourceProps) {
	const [open, setOpen] = useState(false);
	const panelId = `invocation-details-${invocation.id}`;
	return (
		<>
			<tr className={`border-b border-border ${open ? '' : 'last:border-0'}`}>
				<td className="px-3 py-2">
					<InvocationResource
						availableResources={availableResources}
						invocation={invocation}
					/>
				</td>
				<td className="px-3 py-2 text-xs whitespace-nowrap text-foreground">
					{invocationSourceLabel(invocation.source)}
				</td>
				<td className="px-3 py-2 text-xs text-foreground">
					<span className={machineLabelClass} title={invocation.projectName}>
						{invocation.projectName}
					</span>
				</td>
				{/* The duration cell beside this one already had it; the timestamp column did not,
			    so two adjacent numeric columns set their digits on two different widths. */}
				<td className="px-3 py-2 text-xs whitespace-nowrap text-foreground tabular-nums">
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
					<button
						aria-controls={panelId}
						aria-expanded={open}
						aria-label={`Inspect telemetry for ${invocation.resourceName}`}
						className={`flex items-center gap-1 ${inspectTriggerClass}`}
						onClick={() => setOpen(!open)}
						type="button">
						<DisclosureMarker open={open} />
						Inspect
					</button>
				</td>
			</tr>
			{open ? (
				<tr className="border-b border-border last:border-0">
					<td className="px-3 pb-3" colSpan={columns.length} id={panelId}>
						<InvocationDetailsPanel invocation={invocation} />
					</td>
				</tr>
			) : null}
		</>
	);
}

/**
 * The tile at the top of the page that this row is counted under.
 *
 * Not the raw invocation status, because the two are not the same thing: an aborted run carries
 * `status: 'failed'` and is tallied under Stopped, so a cell printing the raw status would read
 * "failed" in muted text under a neutral grey badge, above a red FAILED tile that does not count
 * it. Derived from the same classifier the aggregator uses, the line names the tile the row
 * actually feeds and cannot contradict it.
 */
function InvocationStatusCell({ invocation }: { invocation: InvocationRecord }) {
	if (invocation.runStatus) {
		const run = {
			exitCode: invocation.runExitCode,
			status: invocation.runStatus,
			stopReason: invocation.runStopReason,
			summary: invocation.runSummary,
		};
		const outcome = classifyWebRun(run);
		const tally = telemetryOutcomePresentation[classifyWebRunTelemetryBucket(run)].label;
		// The secondary line earns its place only where the tally says something the badge does
		// not. "Completed" under "Completed" is noise; "Stopped" under "Aborted" is not.
		const echoesBadge = outcome.label.toLowerCase().includes(tally.toLowerCase());
		return (
			<Tooltip content={outcome.title}>
				<span className="inline-flex flex-col items-start">
					<Badge tone={outcome.tone}>{outcome.label}</Badge>
					{echoesBadge ? null : (
						<span className="mt-0.5 block text-2xs text-muted-foreground">
							Counted under {tally}
						</span>
					)}
				</span>
			</Tooltip>
		);
	}
	const presentation = executionStatusPresentation[invocation.status];
	return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
}
