import type { ProjectFeature } from '../../../api/types.ts';
import type { FeatureSortDir, FeatureSortKey } from './features-list-sort.ts';

import { SortableColumnHeader } from '../../../components/shared/SortableColumnHeader.tsx';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { FEATURE_SORT_COLUMNS } from './features-list-sort.ts';
import { featureActionEdgeClass, featureActionTrack } from './featureTableWidths.ts';

/**
 * The feature table's column widths and its nine sortable headers.
 *
 * Split from `FeaturesDesktopTable` so the widths sit beside the rationale that sets them without
 * pushing the row markup past what one file should hold.
 *
 * ## Why rem and not percent
 *
 * The seven-column table expressed these as percentages with a second `@min-[100rem]` tier, because
 * a percentage is not a width and the same 6% that fits `SHIPPED` at 1600 starves it at 1280. Nine
 * columns make that unworkable: every column but Feature is floored by content that cannot shrink,
 * and a floor is a rem. So the fixed tracks are rem and Feature takes the remainder. Source and
 * timestamp tracks yield below the 88rem content tier, where lifecycle and action controls matter
 * more; `OverflowScroller` remains the fallback below the reduced table floor.
 *
 * ## The floors
 *
 * A `SortableColumnHeader` is 16px wider than the plain `<th>` it replaces — `gap-1` plus an
 * `h-3 w-3` icon on a `whitespace-nowrap` button — so every header floor moved. These are measured
 * in the browser, not estimated: rendered button width plus the 32px of `px-4`, against the widest
 * cell the column actually renders.
 *
 * | Column | header | widest cell | track |
 * | --- | --- | --- | --- |
 * | Status | 90 | 160 — the `waiting_approval` badge | 10rem, cell-floored |
 * | Shipped | 97 | 96 | 6.5rem |
 * | Milestone | 112 | 136 — the milestone `<select>` | 8.5rem, cell-floored |
 * | Priority | 100 | 64 | 6.5rem |
 * | Source | 95 | wraps by design (`Feature: Documentation`) | 8rem |
 * | Added | 87 | 70 | 6rem |
 * | Completed | 117 — the widest header here | 70 | 7.5rem |
 *
 * The sum matters more than any one track. At a narrow desktop width, the 21.5rem of lower-priority
 * Source and timestamp columns disappear and the action-aware floor drops with them. At 88rem the
 * full inventory returns without making one exceptional approval row dictate a 27rem action track.
 */
export function FeaturesTableHeader({
	onToggleSort,
	rows,
	sortDir,
	sortKey,
}: {
	onToggleSort: (key: FeatureSortKey) => void;
	rows: ProjectFeature[];
	sortDir: FeatureSortDir;
	sortKey: FeatureSortKey;
}) {
	return (
		<>
			<colgroup>
				<col className="w-auto" />
				<col className="w-[10rem]" />
				<col className="w-[6.5rem]" />
				<col className="w-[8.5rem]" />
				<col className="w-[6.5rem]" />
				<col className="hidden w-[8rem] @min-[88rem]:table-column" />
				<col className="hidden w-[6rem] @min-[88rem]:table-column" />
				<col className="hidden w-[7.5rem] @min-[88rem]:table-column" />
				<col className={featureActionTrack(rows).column} />
			</colgroup>
			<thead className={tableHeadClass}>
				<tr>
					{FEATURE_SORT_COLUMNS.map((column) => (
						<SortableColumnHeader
							activeDir={sortDir}
							activeKey={sortKey}
							className={
								['added', 'completed', 'source'].includes(column.key)
									? 'hidden px-4 py-3 @min-[88rem]:table-cell'
									: 'px-4 py-3'
							}
							key={column.key}
							label={column.label}
							onSort={onToggleSort}
							sortKey={column.key}
						/>
					))}
					{/* Actions stays a plain header: there is nothing to order five buttons by. */}
					<th
						className={`sticky right-0 z-20 bg-muted px-4 py-3 whitespace-nowrap ${featureActionEdgeClass}`}
						scope="col">
						Actions
					</th>
				</tr>
			</thead>
		</>
	);
}
