import { type KeyboardEvent, useState } from 'react';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { FilterSearch } from '../../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../../components/shared/FilterToolbar.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useAuditProfileMapping } from '../../../hooks/useAudits.ts';
import { useViewportFill, viewportFillScrollerClass } from '../../../hooks/useViewportFill.ts';
import { filterRegister } from '../../../lib/filterFields.ts';
import { tableColumnClass, tableHeadClass } from '../../../lib/tableStyles.ts';
import { microLabelClass } from '../../../lib/typography.ts';
import { bucketLabels } from '../../projects/projects-list-shared.ts';
import { bucketColumns } from '../auditsUtils.ts';
import { ApplicabilityMappingEditor } from './ApplicabilityMappingEditor.tsx';
import { groupEquivalentBuckets } from './matrixBucketGroups.ts';
import { EffectCell, MatrixLegend } from './matrixCells.tsx';
import { type MatrixCellPosition, resolveMatrixCellFocus } from './matrixNavigation.ts';

function matrixCellId(row: number, column: number, presentation: 'desktop' | 'mobile'): string {
	return `audit-applicability-${presentation}-cell-${row}-${column}`;
}

export function ApplicabilityTab() {
	const mapping = useAuditProfileMapping();
	const [editorOpen, setEditorOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [activeCell, setActiveCell] = useState<MatrixCellPosition>({ column: 0, row: 0 });
	const matrixRef = useViewportFill<HTMLDivElement>({
		gutterPx: 24,
		// Remeasure after data arrives or editor chrome changes.
		refreshKey: mapping.data ? `${editorOpen}:${mapping.data.matrix.length}` : undefined,
	});

	if (mapping.isLoading) {
		return <LoadingState message="Loading matrix…" />;
	}

	if (mapping.isError || !mapping.data) {
		return (
			<ErrorState
				error={mapping.error}
				message="Could not load audit profile mapping."
				onRetry={() => void mapping.refetch()}
			/>
		);
	}

	// The longest audit tab needs a direct way to reach one matrix row.
	const lower = query.trim().toLowerCase();
	const visibleRows = mapping.data.matrix.filter((row) =>
		lower ? row.auditName.toLowerCase().includes(lower) : true,
	);
	const bucketGroups = groupEquivalentBuckets(mapping.data.matrix, bucketColumns);
	const activeRow = Math.min(activeCell.row, Math.max(0, visibleRows.length - 1));
	const activeColumn = Math.min(activeCell.column, Math.max(0, bucketGroups.length - 1));
	const emptyFilters = filterRegister(
		() => setQuery(''),
		[query.trim() !== '' && { label: 'Search', value: query.trim() }],
	);

	function onMatrixCellKeyDown(
		event: KeyboardEvent<HTMLSpanElement>,
		row: number,
		column: number,
		presentation: 'desktop' | 'mobile',
	): void {
		const next = resolveMatrixCellFocus(
			{ column, row },
			event.key,
			visibleRows.length,
			bucketGroups.length,
		);
		if (!next) return;
		event.preventDefault();
		setActiveCell(next);
		document.getElementById(matrixCellId(next.row, next.column, presentation))?.focus();
	}

	return (
		<div className={`space-y-4 ${tableColumnClass}`}>
			<FilterToolbar
				columns="@min-[36rem]:grid-cols-[minmax(0,28rem)]"
				filtered={visibleRows.length}
				hasFilters={query.trim() !== ''}
				header={
					<div className="flex flex-wrap items-start justify-between gap-3">
						<p className="max-w-[68ch] text-xs text-muted-foreground">
							Cells show the strictest effect any rule could produce for that bucket.
							An asterisk marks additional facet constraints. Hover, focus, or tap a
							cell for its source and rule id.
						</p>
						<Button
							onClick={() => setEditorOpen((value) => !value)}
							variant="secondary">
							{editorOpen ? 'Cancel Edit' : 'Edit Global Mapping'}
						</Button>
					</div>
				}
				noun="audits"
				onReset={() => setQuery('')}
				primaryControlCount={1}
				total={mapping.data.matrix.length}>
				<FilterSearch onChange={setQuery} placeholder="Filter audits" value={query} />
			</FilterToolbar>

			{editorOpen && (
				<ApplicabilityMappingEditor
					mapping={mapping.data.mapping}
					onSaved={() => setEditorOpen(false)}
				/>
			)}

			{/* Keep the shared matrix key visible above both presentations, including on phones. */}
			<div className="flex flex-wrap items-center xl:hidden">
				<MatrixLegend />
			</div>

			{/* Bounding the scrolling element is what makes its sticky header work. Its top edge is
			    measured after the toolbar and optional editor render; a fixed `24rem` subtraction
			    missed that chrome by 52px and could not react when the editor opened. */}
			<Card className="hidden p-0 xl:block">
				<div className="border-b border-border px-3 py-2">
					<MatrixLegend />
				</div>
				<OverflowScroller
					ariaLabel="Audit applicability matrix"
					rootRef={matrixRef}
					scrollerClassName={viewportFillScrollerClass}>
					<table
						aria-colcount={bucketGroups.length + 1}
						aria-label="Audit applicability matrix"
						aria-rowcount={visibleRows.length + 1}
						className="w-full min-w-[820px] table-fixed text-left text-sm"
						role="grid">
						<colgroup>
							<col className="w-[22rem]" />
							{bucketGroups.map((group) => (
								<col key={group.buckets.join(':')} />
							))}
						</colgroup>
						<thead className={`${tableHeadClass} sticky top-0 z-10`}>
							<tr>
								<th className="bg-muted px-3 py-3" scope="col">
									Audit
								</th>
								{bucketGroups.map((group) => {
									const first = group.buckets[0]!;
									const last = group.buckets.at(-1)!;
									const label =
										first === last
											? bucketLabels[first]
											: `${bucketLabels[first]} – ${bucketLabels[last]}`;
									return (
										<th
											aria-label={label}
											className="bg-muted px-3 py-3 text-center"
											key={group.buckets.join(':')}
											scope="col">
											{label}
										</th>
									);
								})}
							</tr>
						</thead>
						<tbody>
							{visibleRows.map((row, rowIndex) => (
								<tr
									className="border-b border-border last:border-0 hover:bg-raised-hover"
									key={row.auditName}>
									<td className="px-3 py-2 font-mono font-medium text-foreground">
										{row.auditName}
									</td>
									{bucketGroups.map((group, columnIndex) => {
										const bucket = group.buckets[0]!;
										return (
											<td
												className="p-0 text-center [&>span]:flex [&>span]:w-full"
												key={group.buckets.join(':')}
												role="gridcell">
												<EffectCell
													cell={row.byBucket[bucket]}
													id={matrixCellId(
														rowIndex,
														columnIndex,
														'desktop',
													)}
													onFocus={() =>
														setActiveCell({
															column: columnIndex,
															row: rowIndex,
														})
													}
													onKeyDown={(event) =>
														onMatrixCellKeyDown(
															event,
															rowIndex,
															columnIndex,
															'desktop',
														)
													}
													tabIndex={
														rowIndex === activeRow &&
														columnIndex === activeColumn
															? 0
															: -1
													}
												/>
											</td>
										);
									})}
								</tr>
							))}
							{visibleRows.length === 0 && (
								<tr>
									<td
										className="px-3 py-6 text-sm text-muted-foreground"
										colSpan={bucketGroups.length + 1}>
										No audits match that search.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</OverflowScroller>
			</Card>

			{visibleRows.length === 0 ? (
				<EmptyState className="xl:hidden" filterReset="toolbar" filters={emptyFilters}>
					No audits match that search.
				</EmptyState>
			) : null}
			<div className="space-y-3 xl:hidden">
				{visibleRows.map((row, rowIndex) => (
					<Card className="p-3" key={row.auditName}>
						<div className="font-mono font-medium text-foreground">{row.auditName}</div>
						<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
							{bucketGroups.map((group, columnIndex) => {
								const first = group.buckets[0]!;
								const last = group.buckets.at(-1)!;
								const label =
									first === last
										? bucketLabels[first]
										: `${bucketLabels[first]} – ${bucketLabels[last]}`;
								return (
									<div
										className={`space-y-1 ${
											bucketGroups.length % 2 === 1 &&
											columnIndex === bucketGroups.length - 1
												? 'col-span-2'
												: ''
										}`}
										key={group.buckets.join(':')}>
										<dt className={`text-muted-foreground ${microLabelClass}`}>
											{label}
										</dt>
										<dd className="[&>span]:flex [&>span]:w-full">
											<EffectCell
												cell={row.byBucket[first]}
												id={matrixCellId(rowIndex, columnIndex, 'mobile')}
												onFocus={() =>
													setActiveCell({
														column: columnIndex,
														row: rowIndex,
													})
												}
												onKeyDown={(event) =>
													onMatrixCellKeyDown(
														event,
														rowIndex,
														columnIndex,
														'mobile',
													)
												}
												tabIndex={
													rowIndex === activeRow &&
													columnIndex === activeColumn
														? 0
														: -1
												}
											/>
										</dd>
									</div>
								);
							})}
						</dl>
					</Card>
				))}
			</div>
		</div>
	);
}
