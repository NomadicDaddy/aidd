import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { SortableColumnHeader } from '../SortableColumnHeader.tsx';

export type LocalRunSortKey = 'duration' | 'result' | 'started';

export function LocalRunsTableHeader({
	onSort,
	sort,
}: {
	onSort: (key: LocalRunSortKey) => void;
	sort: { direction: 'asc' | 'desc'; key: LocalRunSortKey };
}) {
	return (
		<>
			<colgroup>
				<col className="w-11" />
				<col className="w-[12%]" />
				<col className="w-[26%]" />
				<col className="w-[24%]" />
				<col className="w-28" />
				<col />
			</colgroup>
			<thead className={tableHeadClass}>
				<tr>
					<th className="w-8 px-2 py-3" scope="col">
						<span className="sr-only">Expand</span>
					</th>
					<SortableColumnHeader
						activeDir={sort.direction}
						activeKey={sort.key}
						className="px-4 py-3"
						label="Started"
						onSort={onSort}
						sortKey="started"
					/>
					<th className="px-4 py-3" scope="col">
						Execution target
					</th>
					<SortableColumnHeader
						activeDir={sort.direction}
						activeKey={sort.key}
						className="px-4 py-3"
						label="Result"
						onSort={onSort}
						sortKey="result"
					/>
					<SortableColumnHeader
						activeDir={sort.direction}
						activeKey={sort.key}
						className="px-4 py-3 whitespace-nowrap"
						label="Duration"
						onSort={onSort}
						sortKey="duration"
					/>
					<th className="px-4 py-3" scope="col">
						Summary
					</th>
				</tr>
			</thead>
		</>
	);
}
