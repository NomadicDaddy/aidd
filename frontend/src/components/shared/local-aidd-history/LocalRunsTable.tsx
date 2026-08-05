import { aiddExecutionModes } from 'aidd-shared/execution-mode';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { Fragment, useState } from 'react';

import type { ProjectLocalIteration, ProjectLocalRun } from '../../../api/types.ts';

import { formatAiddRunProvenance } from '../../../lib/aiddRunProvenance.ts';
import { formatDate, formatDuration } from '../../../lib/formatters.ts';
import { selectClass } from '../../../lib/formStyles.ts';
import { Button, IconButton } from '../../ui/button.tsx';
import { SegmentedControl } from '../../ui/segmented-control.tsx';
import { ExecutionIdentityBadges } from '../ExecutionIdentityBadges.tsx';
import { OverflowScroller } from '../OverflowScroller.tsx';
import { LocalIterationsTable } from './LocalIterationsTable.tsx';
import { LocalRunResultBadges } from './LocalRunResultBadges.tsx';
import { categorizeRun, OUTCOME_CATEGORIES, type OutcomeCategory } from './outcome.ts';
import { runRowKey, runRuntimeDetail, TriModeBadge } from './runMetadata.tsx';

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
	const availableCategories = (() => {
		const set = new Set<OutcomeCategory>();
		runs.forEach((run, index) => {
			const category = categorizeRun(
				run,
				iterationsByRunKey.get(runRowKey(run, index)) ?? [],
			);
			if (category) set.add(category);
		});
		return set;
	})();
	const visibleRuns = runs
		.map((run, index) => ({ index, run }))
		.filter(({ index, run }) => {
			if (backendFilter !== '__all__' && (run.backend ?? '') !== backendFilter) {
				return false;
			}
			if (activeCategories.size > 0) {
				const category = categorizeRun(
					run,
					iterationsByRunKey.get(runRowKey(run, index)) ?? [],
				);
				if (!category || !activeCategories.has(category)) return false;
			}
			return true;
		});
	const toggleCategory = (category: OutcomeCategory) => {
		setActiveCategories((previous) => {
			const next = new Set(previous);
			if (next.has(category)) next.delete(category);
			else next.add(category);
			return next;
		});
	};
	const visibleKeys = visibleRuns.map(({ index, run }) => runRowKey(run, index));
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
	return (
		<div>
			<div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
				<SegmentedControl
					ariaLabel="Filter by outcome"
					onToggle={toggleCategory}
					options={OUTCOME_CATEGORIES.map((category) => ({
						disabled:
							!availableCategories.has(category) && !activeCategories.has(category),
						label: category,
						value: category,
					}))}
					values={activeCategories}
				/>
				<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span className="sr-only">Filter by backend</span>
					<select
						aria-label="Filter by backend"
						className={`${selectClass} h-8 px-2 text-xs`}
						onChange={(event) => setBackendFilter(event.target.value)}
						value={backendFilter}>
						<option value="__all__">All backends</option>
						{backendOptions.map((backend) => (
							<option key={backend} value={backend}>
								{backend}
							</option>
						))}
					</select>
				</label>
				<Button
					aria-label={
						allVisibleExpanded ? 'Collapse all visible runs' : 'Expand all visible runs'
					}
					className="sm:ml-auto"
					disabled={visibleKeys.length === 0}
					onClick={handleBulkToggle}
					size="compact">
					{allVisibleExpanded ? 'Collapse all' : 'Expand all'}
				</Button>
			</div>
			{visibleRuns.length === 0 ? (
				<div className="px-4 py-4 text-sm text-muted-foreground">
					No runs match the current filters.
				</div>
			) : (
				<OverflowScroller ariaLabel="Local runs">
					<table aria-label="Local runs" className="w-full table-fixed text-left text-sm">
						{/* Auto layout gave DURATION — six characters, always — as much room as SUMMARY,
						    which is the only free-text column and was wrapping to four lines inside 24rem
						    while '1m 4s' sat centred in its own wide column. */}
						<colgroup>
							<col className="w-10" />
							<col className="w-[12%]" />
							<col className="w-[22%]" />
							<col className="w-[24%]" />
							<col className="w-[7%]" />
							<col className="w-[35%]" />
						</colgroup>
						<thead className="border-b border-border bg-muted text-xs text-muted-foreground uppercase">
							<tr>
								<th className="w-8 px-2 py-3" scope="col">
									<span className="sr-only">Expand</span>
								</th>
								<th className="px-4 py-3" scope="col">
									Started
								</th>
								<th className="px-4 py-3" scope="col">
									Execution target
								</th>
								<th className="px-4 py-3" scope="col">
									Result
								</th>
								<th className="px-4 py-3 whitespace-nowrap" scope="col">
									Duration
								</th>
								<th className="px-4 py-3" scope="col">
									Summary
								</th>
							</tr>
						</thead>
						<tbody>
							{visibleRuns.map(({ index, run }) => {
								const key = runRowKey(run, index);
								const isOpen = expanded.has(key);
								const runIterations = iterationsByRunKey.get(key) ?? [];
								const startedLabel = run.startedAt
									? formatDate(run.startedAt)
									: '—';
								const runtimeDetail = runRuntimeDetail(run);
								return (
									<Fragment key={key}>
										<tr className="border-b border-border last:border-0">
											<td className="px-2 py-3 align-top">
												<IconButton
													aria-expanded={isOpen}
													ariaLabel={`${isOpen ? 'Hide' : 'Show'} iterations for run started ${startedLabel}`}
													onClick={() => toggle(key)}
													variant="ghost">
													<ChevronRight
														aria-hidden="true"
														className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
													/>
												</IconButton>
											</td>
											<td className="px-4 py-3 text-xs text-muted-foreground">
												{startedLabel}
											</td>
											<td className="px-4 py-3">
												<div className="flex min-w-0 flex-wrap items-center gap-1.5">
													<ExecutionIdentityBadges
														backend={run.backend}
														model={run.model}
														provider={run.provider}
														reasoningEffort={run.reasoningEffort}
													/>
													{run.executionMode ===
													aiddExecutionModes.triumvirate ? (
														<TriModeBadge
															roles={run.triumvirateRoles}
														/>
													) : null}
													<span className="text-xs text-muted-foreground">
														{runtimeDetail}
													</span>
													<span className="text-xs text-muted-foreground">
														{formatAiddRunProvenance(run)}
													</span>
												</div>
											</td>
											<td className="px-4 py-3">
												<LocalRunResultBadges
													run={run}
													runIterations={runIterations}
												/>
											</td>
											<td className="px-4 py-3 whitespace-nowrap tabular-nums">
												{formatDuration(run.durationMs)}
											</td>
											<td className="px-4 py-3 text-xs break-words text-muted-foreground">
												{run.summary ?? '—'}
											</td>
										</tr>
										{isOpen ? (
											<tr className="border-b border-border bg-muted/50 last:border-0">
												<td className="px-2 py-3" />
												<td className="px-4 py-3" colSpan={5}>
													{runIterations.length > 0 ? (
														<LocalIterationsTable
															iterations={runIterations}
															now={now}
														/>
													) : (
														<div className="text-xs text-muted-foreground">
															No iterations recorded for this run.
														</div>
													)}
												</td>
											</tr>
										) : null}
									</Fragment>
								);
							})}
						</tbody>
					</table>
				</OverflowScroller>
			)}
		</div>
	);
}
