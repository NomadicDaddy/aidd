import { aiddExecutionModes } from 'aidd-shared/execution-mode';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';

import type { ProjectLocalIteration, ProjectLocalRun } from '../../../api/types.ts';

import { formatAiddRunProvenance } from '../../../lib/aiddRunProvenance.ts';
import { formatDate, formatDuration } from '../../../lib/formatters.ts';
import { Button } from '../../ui/button.tsx';
import { ExecutionIdentityBadges } from '../ExecutionIdentityBadges.tsx';
import { LocalIterationsTable } from './LocalIterationsTable.tsx';
import { LocalRunResultBadges } from './LocalRunResultBadges.tsx';
import { runRowKey, runRuntimeDetail, TriModeBadge } from './runMetadata.tsx';

export interface VisibleRun {
	index: number;
	run: ProjectLocalRun;
}

/** The execution-target cell, written once for the table and the cards. */
export function RunExecutionTarget({ run }: { run: ProjectLocalRun }) {
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-1.5">
			<ExecutionIdentityBadges
				backend={run.backend}
				model={run.model}
				provider={run.provider}
				reasoningEffort={run.reasoningEffort}
			/>
			{run.executionMode === aiddExecutionModes.triumvirate ? (
				<TriModeBadge roles={run.triumvirateRoles} />
			) : null}
			<span className="text-xs text-muted-foreground">{runRuntimeDetail(run)}</span>
			{/* Mono, because this line is `aidd 2.137.0 · 716c96c7 · dirty`: a version, a commit
			    SHA and a tree state, all of them machine strings, set directly beneath the mono
			    backend and model chips above them. It was the one half of an execution identity
			    rendered in proportional type. */}
			<span className="font-mono text-xs text-muted-foreground">
				{formatAiddRunProvenance(run)}
			</span>
		</div>
	);
}

/**
 * The phone rendering of the same runs.
 *
 * The table is `table-fixed` with a 7% Duration column that carries `whitespace-nowrap`: a
 * `1h 12m 30s` plus `px-4` padding wants about 100px, so the table's own minimum is over 1000px
 * before the 22% execution-target column or the 35% summary get a say. `xl` is the widest tier the
 * guard has and still the right one — the 992px content column an expanded rail leaves is where the
 * fixed layout stops squeezing the free-text columns — so the cards stand in below that.
 *
 * The disclosure survives the split: the chevron becomes a labelled button, and the iterations it
 * opens are the same `LocalIterationsTable`, which carries its own card stack at this width.
 */
export function LocalRunCards({
	expanded,
	iterationsByRunKey,
	now,
	onToggle,
	visibleRuns,
}: {
	expanded: Set<string>;
	iterationsByRunKey: Map<string, ProjectLocalIteration[]>;
	now: number;
	onToggle: (key: string) => void;
	visibleRuns: VisibleRun[];
}) {
	return (
		<div className="space-y-2 p-4 xl:hidden">
			{visibleRuns.map(({ index, run }) => {
				const key = runRowKey(run, index);
				const isOpen = expanded.has(key);
				const runIterations = iterationsByRunKey.get(key) ?? [];
				const startedLabel = run.startedAt ? formatDate(run.startedAt) : '—';
				return (
					<div className="rounded-md border border-border" key={key}>
						<div className="space-y-2 p-3">
							<div className="flex items-start justify-between gap-2">
								<span className="text-xs text-muted-foreground">
									{startedLabel}
								</span>
								<span className="shrink-0 text-xs whitespace-nowrap tabular-nums">
									{formatDuration(run.durationMs)}
								</span>
							</div>
							<RunExecutionTarget run={run} />
							<LocalRunResultBadges run={run} runIterations={runIterations} />
							<p className="text-xs break-words text-muted-foreground">
								{run.summary ?? '—'}
							</p>
						</div>
						<div className="border-t border-border">
							<Button
								aria-expanded={isOpen}
								aria-label={`${isOpen ? 'Hide' : 'Show'} iterations for run started ${startedLabel}`}
								className="w-full justify-start rounded-t-none"
								onClick={() => onToggle(key)}
								size="compact"
								variant="ghost">
								<ChevronRight
									aria-hidden="true"
									className={`mr-1.5 h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
								/>
								{isOpen ? 'Hide' : 'Show'} iterations ({runIterations.length})
							</Button>
							{isOpen ? (
								<div className="bg-muted/50">
									{runIterations.length > 0 ? (
										<LocalIterationsTable
											iterations={runIterations}
											now={now}
										/>
									) : (
										<div className="px-3 py-2 text-xs text-muted-foreground">
											No iterations recorded for this run.
										</div>
									)}
								</div>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}
