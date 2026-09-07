import { aiddExecutionModes } from 'aidd-shared/execution-mode';

import type { ProjectLocalIteration } from '../../../api/types.ts';

import { formatDate, formatDuration } from '../../../lib/formatters.ts';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { Badge } from '../../ui/badge.tsx';
import { Tooltip } from '../../ui/tooltip.tsx';
import { ExecutionIdentityBadges } from '../ExecutionIdentityBadges.tsx';
import { OverflowScroller } from '../OverflowScroller.tsx';
import { classifyIteration } from './outcome.ts';
import { TriModeBadge } from './runMetadata.tsx';

function iterationDurationLabel(iteration: ProjectLocalIteration, now: number): string {
	if (iteration.status === 'running') {
		const started = iteration.startedAt ? Date.parse(iteration.startedAt) : Number.NaN;
		if (!Number.isNaN(started)) return formatDuration(Math.max(0, now - started));
	}
	return formatDuration(iteration.durationMs);
}

function IterationStatus({ iteration }: { iteration: ProjectLocalIteration }) {
	const outcome = classifyIteration(iteration);
	return (
		<Tooltip content={outcome.title}>
			<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
				<Badge showDot tone={outcome.tone}>
					{outcome.label}
				</Badge>
			</span>
		</Tooltip>
	);
}

function IterationTarget({ iteration }: { iteration: ProjectLocalIteration }) {
	return (
		<>
			<ExecutionIdentityBadges backend={iteration.backend} />
			{iteration.executionMode === aiddExecutionModes.triumvirate ? (
				<div className="mt-1">
					<TriModeBadge roles={iteration.triumvirateRoles} />
				</div>
			) : null}
		</>
	);
}

function IterationFeatures({ iteration }: { iteration: ProjectLocalIteration }) {
	const distinctFeatures = (() => {
		const seen = new Set<string>();
		const ordered: string[] = [];
		for (const slug of [...iteration.completedFeatures, ...iteration.selectedFeatures]) {
			if (!seen.has(slug)) {
				seen.add(slug);
				ordered.push(slug);
			}
		}
		return ordered;
	})();

	const fallback =
		iteration.completedFeatures[0] ?? iteration.selectedFeatures[0] ?? iteration.summary ?? '—';

	if (distinctFeatures.length <= 1) return <>{fallback}</>;

	const first = distinctFeatures[0];
	const remaining = distinctFeatures.length - 1;
	const tooltipContent = (
		<ul className="m-0 list-none space-y-0.5 p-0 text-left">
			{distinctFeatures.map((slug) => (
				<li key={slug}>{slug}</li>
			))}
		</ul>
	);

	return (
		<Tooltip content={tooltipContent}>
			<span
				className="inline-flex max-w-full flex-wrap items-baseline gap-x-1 rounded-md break-words focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				tabIndex={0}>
				<span className="break-words">{first}</span>
				<span className="text-muted-foreground">· +{remaining} more</span>
			</span>
		</Tooltip>
	);
}

/**
 * The phone rendering of the same iterations.
 *
 * Six columns come to roughly 800px of minimum width — the execution-target badges, a status badge,
 * a formatted timestamp and a feature list that is capped at 22rem but rarely short — so `xl` is
 * the smallest tier whose content column (992px with the rail expanded) holds the table.
 */
function IterationCards({ iterations, now }: { iterations: ProjectLocalIteration[]; now: number }) {
	return (
		<div className="space-y-2 px-4 pb-4 xl:hidden">
			{iterations.map((iteration, index) => (
				<div
					className="rounded-md border border-border p-3"
					key={`${iteration.startedAt ?? 'iteration'}-${iteration.iteration ?? index}`}>
					<div className="flex items-start justify-between gap-2">
						<span className="font-mono text-xs text-muted-foreground">
							Iteration {iteration.iteration ?? '—'}
						</span>
						<IterationStatus iteration={iteration} />
					</div>
					<div className="mt-2">
						<IterationTarget iteration={iteration} />
					</div>
					<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
						<span>
							Started {iteration.startedAt ? formatDate(iteration.startedAt) : '—'}
						</span>
						<span className="tabular-nums">
							{iterationDurationLabel(iteration, now)}
						</span>
					</div>
					<p className="mt-2 text-xs break-words text-muted-foreground">
						<IterationFeatures iteration={iteration} />
					</p>
				</div>
			))}
		</div>
	);
}

export function LocalIterationsTable({
	iterations,
	now,
}: {
	iterations: ProjectLocalIteration[];
	now: number;
}) {
	return (
		<>
			<IterationCards iterations={iterations} now={now} />
			<OverflowScroller ariaLabel="Local iterations" className="hidden xl:block">
				<table aria-label="Local iterations" className="w-full text-left text-sm">
					<thead className={tableHeadClass}>
						<tr>
							<th className="px-4 py-3" scope="col">
								Iteration
							</th>
							<th className="px-4 py-3" scope="col">
								Execution target
							</th>
							<th className="px-4 py-3" scope="col">
								Status
							</th>
							<th className="px-4 py-3" scope="col">
								Started
							</th>
							<th className="px-4 py-3" scope="col">
								Duration
							</th>
							<th className="px-4 py-3" scope="col">
								Features
							</th>
						</tr>
					</thead>
					<tbody>
						{iterations.map((iteration, index) => (
							<tr
								className="border-b border-border last:border-0"
								key={`${iteration.startedAt ?? 'iteration'}-${iteration.iteration ?? index}`}>
								<td className="px-4 py-3 font-mono text-xs">
									{iteration.iteration ?? '—'}
								</td>
								<td className="px-4 py-3">
									<IterationTarget iteration={iteration} />
								</td>
								<td className="px-4 py-3">
									<IterationStatus iteration={iteration} />
								</td>
								<td className="px-4 py-3 text-xs text-muted-foreground">
									{iteration.startedAt ? formatDate(iteration.startedAt) : '—'}
								</td>
								<td className="px-4 py-3">
									{iterationDurationLabel(iteration, now)}
								</td>
								<td className="max-w-[22rem] px-4 py-3 text-xs break-words text-muted-foreground">
									<IterationFeatures iteration={iteration} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</OverflowScroller>
		</>
	);
}
