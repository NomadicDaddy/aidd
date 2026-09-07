import { useState } from 'react';

import type { FeatureSummary } from '../../api/types.ts';

import { FilterToolbarReadout } from '../../components/shared/FilterToolbarReadout.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { SortableColumnHeader } from '../../components/shared/SortableColumnHeader.tsx';
import {
	contentSizedColumnClass,
	contentSizedTableClass,
	tableHeadClass,
	tableMeasureClass,
} from '../../lib/tableStyles.ts';
import { microLabelClass } from '../../lib/typography.ts';
import { DASHBOARD_CARD_MAX_ROWS } from './dashboard-shared.ts';

export interface FeatureSummaryRow extends FeatureSummary {
	application: string;
}

interface FeatureSummaryColumn {
	align: 'left' | 'right';
	header: string;
	key: keyof FeatureSummaryRow;
	value: (row: FeatureSummaryRow) => number | string;
}

const summaryColumns: FeatureSummaryColumn[] = [
	{
		align: 'left',
		header: 'Application',
		key: 'application',
		value: (row) => row.application,
	},
	{
		align: 'right',
		header: 'Audit',
		key: 'audit',
		value: (row) => row.audit,
	},
	{
		align: 'right',
		header: 'Remediation',
		key: 'remediation',
		value: (row) => row.remediation,
	},
	{
		align: 'right',
		header: 'Feature',
		key: 'feature',
		value: (row) => row.feature,
	},
	{
		align: 'right',
		header: 'Pending',
		key: 'pending',
		value: (row) => row.pending,
	},
	{
		align: 'right',
		header: 'Completed',
		key: 'completed',
		value: (row) => row.completed,
	},
	{
		align: 'right',
		header: 'Total',
		key: 'total',
		value: (row) => row.total,
	},
];

/** Every column but Application, which is the card's own heading. */
const cardColumns = summaryColumns.filter((column) => column.header !== 'Application');

/**
 * The two renderings of the fleet feature counts.
 *
 * Kept apart from `FeatureSummaryCard` — the same split `FeatureStatusRows` makes in this
 * directory, and for the same reason: the pair would cross the per-file line cap, and the card is
 * a header, a metric trio and a branch on load state.
 *
 * The table's own `min-w-[700px]` is the measurement. Its card needs 44rem of content width before
 * all seven columns fit, regardless of whether the dashboard grid gave the card half or full width.
 */
export function FeatureSummaryRows({
	rows,
	totals,
}: {
	rows: FeatureSummaryRow[];
	totals: FeatureSummary;
}) {
	const [sort, setSort] = useState<{
		direction: 'asc' | 'desc';
		key: keyof FeatureSummaryRow;
	}>({ direction: 'asc', key: 'application' });
	const orderedRows = rows.toSorted((left, right) => {
		const leftValue = left[sort.key];
		const rightValue = right[sort.key];
		const comparison =
			typeof leftValue === 'number' && typeof rightValue === 'number'
				? leftValue - rightValue
				: String(leftValue).localeCompare(String(rightValue));
		return sort.direction === 'asc' ? comparison : -comparison;
	});
	const displayedRows = orderedRows.slice(0, DASHBOARD_CARD_MAX_ROWS);
	function toggleSort(key: keyof FeatureSummaryRow): void {
		setSort((current) => ({
			direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
			key,
		}));
	}
	return (
		<div className="@container">
			<FilterToolbarReadout
				className="mb-3"
				filtered={displayedRows.length}
				noun="applications"
				responsiveScope="viewport"
				total={rows.length}
			/>
			<FeatureSummaryCards rows={displayedRows} totals={totals} />
			{/* The dashboard shows a bounded preview; OverflowScroller keeps the same subset
			    reachable when its seven columns exceed the card width. */}
			<OverflowScroller
				ariaLabel="Feature summary by application"
				className={`-mx-2 hidden px-2 @min-[44rem]:block ${tableMeasureClass}`}>
				<table className={`${contentSizedTableClass} min-w-[700px]`}>
					<colgroup>
						{summaryColumns.map((column) => (
							<col
								className={
									column.key === 'application'
										? undefined
										: contentSizedColumnClass
								}
								key={column.key}
							/>
						))}
					</colgroup>
					<thead className={tableHeadClass}>
						<tr>
							{summaryColumns.map((column) => (
								<SortableColumnHeader
									activeDir={sort.direction}
									activeKey={sort.key}
									className={
										column.align === 'right'
											? 'px-3 py-2 text-right'
											: 'px-3 py-2 text-left'
									}
									key={column.key}
									label={column.header}
									onSort={toggleSort}
									sortKey={column.key}
								/>
							))}
						</tr>
					</thead>
					<tbody>
						{displayedRows.map((row) => (
							<tr
								className="border-b border-border last:border-b-0"
								key={row.application}>
								{summaryColumns.map((column) => (
									<td
										className={
											column.align === 'right'
												? 'px-3 py-2 text-right font-medium text-foreground tabular-nums'
												: 'truncate px-3 py-2 font-mono font-medium text-foreground'
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
		</div>
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
		<div className="space-y-2 @min-[44rem]:hidden">
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
			<div className={`truncate font-medium text-foreground ${emphasis ? '' : 'font-mono'}`}>
				{row.application}
			</div>
			<dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
				{cardColumns.map((column) => (
					<div key={column.header}>
						<dt className={`text-muted-foreground ${microLabelClass}`}>
							{column.header}
						</dt>
						<dd className="mt-0.5 font-medium text-foreground tabular-nums">
							{column.value(row)}
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
