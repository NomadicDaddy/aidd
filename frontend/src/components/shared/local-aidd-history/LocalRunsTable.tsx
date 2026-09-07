import { Fragment, useState } from 'react';

import type { ProjectLocalIteration, ProjectLocalRun } from '../../../api/types.ts';

import { backendLabel } from '../../../lib/backends.ts';
import { countActiveFilters, filterRegister } from '../../../lib/filterFields.ts';
import { formatDate, formatDuration } from '../../../lib/formatters.ts';
import { interactiveTableRowClass } from '../../../lib/tableStyles.ts';
import { Button, IconButton } from '../../ui/button.tsx';
import { FieldRow } from '../../ui/field.tsx';
import { SegmentedControl } from '../../ui/segmented-control.tsx';
import { DisclosureMarker } from '../DisclosureMarker.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { FilterSelect } from '../FilterFields.tsx';
import { FilterToolbar } from '../FilterToolbar.tsx';
import { OverflowScroller } from '../OverflowScroller.tsx';
import { LocalIterationsTable } from './LocalIterationsTable.tsx';
import { LocalRunCards, RunExecutionTarget } from './LocalRunCards.tsx';
import { LocalRunResultBadges } from './LocalRunResultBadges.tsx';
import { type LocalRunSortKey, LocalRunsTableHeader } from './LocalRunsTableHeader.tsx';
import { categorizeRun, OUTCOME_CATEGORIES, type OutcomeCategory } from './outcome.ts';
import { runRowKey } from './runMetadata.tsx';

export function LocalRunsTable({
	iterationsByRunKey,
	now,
	runs,
}: {
	iterationsByRunKey: Map<string, ProjectLocalIteration[]>;
	now: number;
	runs: ProjectLocalRun[];
}) {
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const [activeCategories, setActiveCategories] = useState<Set<OutcomeCategory>>(() => new Set());
	const [backendFilter, setBackendFilter] = useState<string>('__all__');
	const [sort, setSort] = useState<{
		direction: 'asc' | 'desc';
		key: LocalRunSortKey;
	}>({ direction: 'desc', key: 'started' });
	const toggle = (key: string) => {
		setExpanded((previous) => {
			const next = new Set(previous);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};
	const backendOptions = (() => {
		const set = new Set<string>();
		for (const run of runs) if (run.backend) set.add(run.backend);
		return Array.from(set).sort();
	})();
	const categorizedRuns = runs.map((run, index) => ({
		category: categorizeRun(run, iterationsByRunKey.get(runRowKey(run, index)) ?? []),
		index,
		run,
	}));
	const categoryCounts = new Map<OutcomeCategory, number>();
	for (const { category } of categorizedRuns) {
		if (category) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
	}
	const visibleRuns = categorizedRuns.filter(({ category, run }) => {
		if (backendFilter !== '__all__' && (run.backend ?? '') !== backendFilter) {
			return false;
		}
		if (activeCategories.size > 0) {
			if (!category || !activeCategories.has(category)) return false;
		}
		return true;
	});
	const orderedRuns = visibleRuns.toSorted((left, right) => {
		let comparison: number;
		switch (sort.key) {
			case 'duration':
				comparison = (left.run.durationMs ?? 0) - (right.run.durationMs ?? 0);
				break;
			case 'result':
				comparison = (left.category ?? '').localeCompare(right.category ?? '');
				break;
			case 'started':
				comparison =
					(Date.parse(left.run.startedAt ?? '') || 0) -
					(Date.parse(right.run.startedAt ?? '') || 0);
				break;
		}
		return sort.direction === 'asc' ? comparison : -comparison;
	});
	const toggleSort = (key: LocalRunSortKey): void => {
		setSort((current) => ({
			direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
			key,
		}));
	};
	const toggleCategory = (category: OutcomeCategory) => {
		setActiveCategories((previous) => {
			const next = new Set(previous);
			if (next.has(category)) next.delete(category);
			else next.add(category);
			return next;
		});
	};
	const visibleKeys = orderedRuns
		.filter(
			({ index, run }) => (iterationsByRunKey.get(runRowKey(run, index)) ?? []).length > 0,
		)
		.map(({ index, run }) => runRowKey(run, index));
	const allVisibleExpanded =
		visibleKeys.length > 0 && visibleKeys.every((key) => expanded.has(key));
	const handleBulkToggle = () => {
		setExpanded((previous) => {
			if (allVisibleExpanded) {
				const next = new Set(previous);
				for (const key of visibleKeys) next.delete(key);
				return next;
			}
			const next = new Set(previous);
			for (const key of visibleKeys) next.add(key);
			return next;
		});
	};
	const hasFilters = activeCategories.size > 0 || backendFilter !== '__all__';
	const resetFilters = () => {
		setActiveCategories(new Set());
		setBackendFilter('__all__');
	};
	const emptyFilters = filterRegister(resetFilters, [
		activeCategories.size > 0 && {
			label: 'Category',
			value: [...activeCategories].join(', '),
		},
		backendFilter !== '__all__' && { label: 'Source', value: backendLabel(backendFilter) },
	]);
	return (
		<div>
			<FilterToolbar
				actionLayout="stacked"
				actionRole="display"
				actions={
					<Button
						aria-label={
							allVisibleExpanded
								? 'Collapse all visible runs'
								: 'Expand all visible runs'
						}
						disabled={visibleKeys.length === 0}
						onClick={handleBulkToggle}>
						{allVisibleExpanded ? 'Collapse all' : 'Expand all'}
					</Button>
				}
				activeFilterCount={countActiveFilters(backendFilter !== '__all__')}
				className="rounded-none border-x-0 border-t-0 shadow-none"
				columns="@min-[48rem]:grid-cols-[minmax(0,1fr)_12rem]"
				filtered={visibleRuns.length}
				hasFilters={hasFilters}
				noun="runs"
				onReset={resetFilters}
				primaryControlCount={1}
				total={runs.length}>
				<FieldRow group label="Outcome">
					<SegmentedControl
						ariaLabel="Filter by outcome"
						onToggle={toggleCategory}
						options={OUTCOME_CATEGORIES.map((category) => ({
							count: categoryCounts.get(category) ?? 0,
							disabled:
								!categoryCounts.has(category) && !activeCategories.has(category),
							label: category,
							value: category,
						}))}
						size="default"
						values={activeCategories}
					/>
				</FieldRow>
				<FilterSelect
					label="CLI"
					onChange={setBackendFilter}
					options={[
						{ label: 'All CLIs', value: '__all__' },
						...backendOptions.map((backend) => ({
							label: backendLabel(backend),
							value: backend,
						})),
					]}
					value={backendFilter}
				/>
			</FilterToolbar>
			{visibleRuns.length === 0 ? (
				<div className="p-4">
					<EmptyState filterReset="toolbar" filters={emptyFilters}>
						No runs match the current filters.
					</EmptyState>
				</div>
			) : (
				<>
					<LocalRunCards
						expanded={expanded}
						iterationsByRunKey={iterationsByRunKey}
						now={now}
						onToggle={toggle}
						visibleRuns={orderedRuns}
					/>
					<OverflowScroller ariaLabel="Local runs" className="hidden xl:block">
						<table
							aria-label="Local runs"
							className="w-full table-fixed text-left text-sm">
							{/* Auto layout gave DURATION — six characters, always — as much room as SUMMARY,
							    which is the only free-text column and was wrapping to four lines inside 24rem. */}
							<LocalRunsTableHeader onSort={toggleSort} sort={sort} />
							<tbody>
								{orderedRuns.map(({ index, run }) => {
									const key = runRowKey(run, index);
									const isOpen = expanded.has(key);
									const runIterations = iterationsByRunKey.get(key) ?? [];
									const startedLabel = run.startedAt
										? formatDate(run.startedAt)
										: '—';
									return (
										<Fragment key={key}>
											<tr
												className={`border-b border-border last:border-0 ${interactiveTableRowClass}`}>
												<td className="px-2 py-3 align-top">
													{runIterations.length > 0 ? (
														<IconButton
															aria-expanded={isOpen}
															ariaLabel={`${isOpen ? 'Hide' : 'Show'} iterations for run started ${startedLabel}`}
															onClick={() => toggle(key)}
															variant="ghost">
															<DisclosureMarker open={isOpen} />
														</IconButton>
													) : (
														<span className="text-xs text-muted-foreground">
															—
														</span>
													)}
												</td>
												<td className="px-4 py-3 text-xs text-muted-foreground">
													{startedLabel}
												</td>
												<td className="px-4 py-3">
													<RunExecutionTarget run={run} />
												</td>
												<td className="px-4 py-3">
													<LocalRunResultBadges
														run={run}
														runIterations={runIterations}
													/>
												</td>
												<td className="px-4 py-3 whitespace-nowrap tabular-nums">
													<div>{formatDuration(run.durationMs)}</div>
													<div className="text-xs text-muted-foreground">
														{runIterations.length}{' '}
														{runIterations.length === 1
															? 'iteration'
															: 'iterations'}
													</div>
												</td>
												<td className="px-4 py-3 text-xs break-words text-muted-foreground">
													{run.summary ?? '—'}
												</td>
											</tr>
											{isOpen && runIterations.length > 0 ? (
												<tr className="border-b border-border bg-muted/50 last:border-0">
													<td className="px-2 py-3" />
													<td className="px-4 py-3" colSpan={5}>
														<LocalIterationsTable
															iterations={runIterations}
															now={now}
														/>
													</td>
												</tr>
											) : null}
										</Fragment>
									);
								})}
							</tbody>
						</table>
					</OverflowScroller>
				</>
			)}
		</div>
	);
}
