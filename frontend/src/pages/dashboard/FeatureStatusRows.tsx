import { Link } from 'react-router';

import type { FeatureStatusType } from '../../api/types.ts';

import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { humanizeEnum } from '../../lib/formatters.ts';
import { touchTargetRowClass } from '../../lib/touchTarget.ts';
import { priorityLabel, priorityTone } from './dashboard-shared.ts';

export interface FeatureStatusRow {
	completed: boolean;
	directory: string;
	priority: null | number | string;
	projectId: string;
	projectName: string;
	status: null | string;
	title: string;
	type: FeatureStatusType;
}

function statusLabel(row: FeatureStatusRow): string {
	return humanizeEnum(row.completed ? 'completed' : (row.status ?? 'pending'));
}

function rowLink(row: FeatureStatusRow): string {
	const projectId = encodeURIComponent(row.projectId);
	const query = new URLSearchParams({
		featureQ: row.directory,
		tab: 'features',
	});
	return `/projects/${projectId}?${query.toString()}`;
}

/**
 * The two renderings of the fleet feature list.
 *
 * They moved out of `FeatureStatusCard` when the card stack was added: the pair crossed the
 * per-file line cap, and the card is a header, two filters and a branch on load state, which is a
 * different job from painting 181 rows.
 *
 * The table used to sit in a hand-rolled `-mx-2 max-h-[28rem] overflow-auto px-2`. It scrolled, so
 * nothing was clipped — but it got no edge fade and no tab stop, while `FeatureSummaryCard` in this
 * same directory wrapped its own `min-w-[700px]` table in `OverflowScroller` and carried a comment
 * explaining why. One page, one problem, two answers.
 */
export function FeatureStatusRows({ rows }: { rows: FeatureStatusRow[] }) {
	return (
		<>
			{/* `lg` rather than `xl`: the table declares `min-w-[640px]` and this card is the
			    full-width row of the dashboard, so it fits the 736px column an expanded rail leaves
			    at 1024. The stack takes over below that, where 640px would not fit. */}
			<OverflowScroller
				ariaLabel="Fleet feature status"
				className="hidden lg:block"
				scrollerClassName="-mx-2 max-h-[28rem] px-2">
				<FeatureStatusTable rows={rows} />
			</OverflowScroller>
			<div
				aria-label="Fleet feature status"
				className="max-h-[28rem] divide-y divide-border overflow-y-auto lg:hidden"
				role="list">
				{rows.map((row) => (
					<FeatureStatusCardRow key={`${row.projectName}:${row.directory}`} row={row} />
				))}
			</div>
		</>
	);
}

function FeatureStatusCardRow({ row }: { row: FeatureStatusRow }) {
	return (
		<div
			// The same tracking tint the `<tr>` below carries, so the card stack and the table are
			// one behaviour at two widths rather than two.
			className="-mx-2 flex items-start justify-between gap-3 px-2 py-2.5 transition-colors hover:bg-muted/40"
			role="listitem">
			<div className="min-w-0">
				<Link
					className={`group block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${touchTargetRowClass}`}
					to={rowLink(row)}>
					<span className="block truncate font-medium text-accent group-hover:underline">
						{row.directory}
					</span>
					<span className="mt-0.5 block truncate text-xs text-muted-foreground">
						{row.title}
					</span>
				</Link>
				<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
					<span className="min-w-0 truncate font-medium text-foreground">
						{row.projectName}
					</span>
					<span aria-hidden="true">·</span>
					<span>{statusLabel(row)}</span>
				</div>
			</div>
			<Badge tone={priorityTone(row.priority)}>{priorityLabel(row.priority)}</Badge>
		</div>
	);
}

function FeatureStatusTable({ rows }: { rows: FeatureStatusRow[] }) {
	return (
		<>
			{/* No TYPE column. The type filter above is single-select and always pins it, so the
			    column printed the same toned Badge on all 181 rows — a column that cannot vary is
			    a column that carries no information, and a tone spent on it says "status" about a
			    taxonomy. The filter states the type once. */}
			{/* `w-full` beside the floor: `min-w-[640px]` alone lets the table sit at its intrinsic
			    width inside a much wider `OverflowScroller`, so on a 2250 screen the dashboard's
			    full-width card held a 640px table against a 1300px void. */}
			<table className="w-full min-w-[640px] text-sm">
				<thead className="sticky top-0 z-10 bg-card">
					<tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase">
						<th className="px-3 py-2 text-left">Application</th>
						<th className="px-3 py-2 text-left">Feature</th>
						<th className="px-3 py-2 text-left">State</th>
						<th className="px-3 py-2 text-right">Priority</th>
					</tr>
				</thead>
				<tbody>
					{/* The row navigates, but only the 448px link cell said so — the other three cells
					    were inert surface on a row whose whole width is a click target's worth of
					    information. The hover moves onto the `tr`, which is the element the pointer
					    is actually over. `bg-muted/40` and not a new tint: FeaturesDesktopTable and
					    ProfileMatrixRow are the two table exemplars and this is what they use. */}
					{rows.map((row) => (
						<tr
							className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/40"
							key={`${row.projectName}:${row.directory}`}>
							<td className="max-w-44 truncate px-3 py-2 font-medium text-foreground">
								{row.projectName}
							</td>
							<td className="px-3 py-2">
								<Link
									className="group block max-w-[28rem] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background max-sm:min-h-11"
									to={rowLink(row)}>
									<span className="block truncate font-medium text-accent group-hover:underline">
										{row.directory}
									</span>
									<span className="mt-0.5 block truncate text-xs text-muted-foreground">
										{row.title}
									</span>
								</Link>
							</td>
							{/* `waiting_approval` was printed raw in font-sans at text-foreground.
							    Snake_case with an underscore is the one shape the baseline reserves
							    for machine identifiers set in mono, so a body-face `in_progress`
							    read as a leaked field name rather than as a state. */}
							<td className="px-3 py-2 text-foreground">{statusLabel(row)}</td>
							{/* Priority was plain body text here and a toned Badge one card away in
							    the Feature Queue, with a different null label ('P-' vs 'P—'), so one
							    concept changed shape between two cards on the same page. Both now
							    read through priorityTone/priorityLabel in dashboard-shared. */}
							<td className="px-3 py-2">
								<span className="flex justify-end">
									<Badge tone={priorityTone(row.priority)}>
										{priorityLabel(row.priority)}
									</Badge>
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</>
	);
}
