import type { FeatureSummary } from '../../api/types.ts';

import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';

export interface FeatureSummaryRow extends FeatureSummary {
	application: string;
}

interface FeatureSummaryColumn {
	align: 'left' | 'right';
	header: string;
	value: (row: FeatureSummaryRow) => number | string;
}

const summaryColumns: FeatureSummaryColumn[] = [
	{
		align: 'left',
		header: 'Application',
		value: (row) => row.application,
	},
	{
		align: 'right',
		header: 'Audit',
		value: (row) => row.audit,
	},
	{
		align: 'right',
		header: 'Remediation',
		value: (row) => row.remediation,
	},
	{
		align: 'right',
		header: 'Feature',
		value: (row) => row.feature,
	},
	{
		align: 'right',
		header: 'Pending',
		value: (row) => row.pending,
	},
	{
		align: 'right',
		header: 'Completed',
		value: (row) => row.completed,
	},
	{
		align: 'right',
		header: 'Total',
		value: (row) => row.total,
	},
];

/** Every column but Application, which is the card's own heading. */
const cardColumns = summaryColumns.filter((column) => column.header !== 'Application');

/**
 * The two renderings of the fleet feature counts.
 *
 * They moved out of `FeatureSummaryCard` when the card stack was added — the same split
 * `FeatureStatusRows` made in this directory, and for the same reason: the pair crossed the
 * per-file line cap and the card is a header, a metric trio and a branch on load state.
 *
 * `lg` rather than `xl`, and the table's own `min-w-[700px]` is the measurement: the dashboard grid
 * is one column until `xl`, so this card gets the whole 736px an expanded rail leaves at 1024 and
 * the table fits it. Below that it does not, which is where the cards take over. At `xl` the grid
 * splits into two ~488px columns and the table stops fitting again — that is what the scrollport is
 * for, and the comment on it says so.
 */
export function FeatureSummaryRows({
	rows,
	totals,
}: {
	rows: FeatureSummaryRow[];
	totals: FeatureSummary;
}) {
	return (
		<>
			<FeatureSummaryCards rows={rows} totals={totals} />
			{/* A 33-row table with no ceiling ran ~1,400px and killed whatever card shared its grid
			    row; wider than the card at tablet widths it also clipped PENDING — the one number
			    this card's own badge highlights — with nothing at the edge saying so.
			    OverflowScroller supplies the edge fade and a keyboard-reachable scrollport, and the
			    head and totals row stay pinned while the body scrolls. */}
			<OverflowScroller
				ariaLabel="Feature summary by application"
				className="-mx-2 hidden px-2 lg:block"
				scrollerClassName="max-h-[28rem]">
				<table className="w-full min-w-[700px] text-sm">
					<thead className="sticky top-0 z-10 bg-card">
						<tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase">
							{summaryColumns.map((column) => (
								<th
									className={
										column.align === 'right'
											? 'px-3 py-2 text-right'
											: 'px-3 py-2 text-left'
									}
									key={column.header}>
									{column.header}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr
								className="border-b border-border last:border-b-0"
								key={row.application}>
								{summaryColumns.map((column) => (
									<td
										className={
											column.align === 'right'
												? 'px-3 py-2 text-right font-medium text-foreground tabular-nums'
												: 'max-w-52 truncate px-3 py-2 font-medium text-foreground'
										}
										key={column.header}>
										{column.value(row)}
									</td>
								))}
							</tr>
						))}
					</tbody>
					<tfoot className="sticky bottom-0 z-10 bg-card">
						<tr className="border-t border-border text-sm font-semibold text-foreground">
							{summaryColumns.map((column) => (
								<td
									className={
										column.align === 'right'
											? 'px-3 py-3 text-right tabular-nums'
											: 'px-3 py-3 text-left'
									}
									key={column.header}>
									{column.header === 'Application'
										? 'Total'
										: column.value({ application: 'Total', ...totals })}
								</td>
							))}
						</tr>
					</tfoot>
				</table>
			</OverflowScroller>
		</>
	);
}

/**
 * The phone rendering. The pinned `tfoot` has no card equivalent, so the fleet total is the last
 * card in the list rather than a row that disappears with the table — dropping it would lose the
 * only number on this surface that is about the fleet instead of one application.
 */
function FeatureSummaryCards({
	rows,
	totals,
}: {
	rows: FeatureSummaryRow[];
	totals: FeatureSummary;
}) {
	return (
		<div className="max-h-[28rem] space-y-2 overflow-y-auto lg:hidden">
			{rows.map((row) => (
				<FeatureSummaryCardRow key={row.application} row={row} />
			))}
			<FeatureSummaryCardRow emphasis row={{ application: 'Fleet total', ...totals }} />
		</div>
	);
}

function FeatureSummaryCardRow({ emphasis, row }: { emphasis?: boolean; row: FeatureSummaryRow }) {
	return (
		<div
			className={`rounded-md border border-border p-3 ${emphasis ? 'bg-muted font-semibold' : ''}`}>
			<div className="truncate font-medium text-foreground">{row.application}</div>
			<dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
				{cardColumns.map((column) => (
					<div key={column.header}>
						<dt className="text-muted-foreground uppercase">{column.header}</dt>
						<dd className="mt-0.5 font-medium text-foreground tabular-nums">
							{column.value(row)}
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
