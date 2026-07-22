import type {
	ProjectUsageExecutionTarget,
	ProjectUsageMode,
	ProjectUsageSummary,
	ProjectUsageTotals,
} from '../../../api/types.ts';

import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { formatCompactNumber } from '../../../lib/formatters.ts';
import { formatReportedCost } from '../projects-list-shared.ts';

function costLabel(usage: ProjectUsageTotals): string {
	return formatReportedCost(usage);
}

function MetricSummary({ detail, label, value }: { detail: string; label: string; value: string }) {
	return (
		<div className="bg-card min-w-0 px-4 py-3">
			<div className="text-xs text-neutral-500 uppercase">{label}</div>
			<div className="mt-1 text-xl font-semibold text-neutral-950 dark:text-neutral-50">
				{value}
			</div>
			<div className="mt-1 text-xs text-neutral-500">{detail}</div>
		</div>
	);
}

function UsageMetricCells({ usage }: { usage: ProjectUsageTotals }) {
	return (
		<>
			<td className="px-3 py-2 text-right tabular-nums">{usage.runCount}</td>
			<td className="px-3 py-2 text-right">
				<div className="font-medium tabular-nums">
					{formatCompactNumber(usage.totalTokens)}
				</div>
				<div className="text-[11px] text-neutral-500 tabular-nums">
					{formatCompactNumber(usage.inputTokens)} in ·{' '}
					{formatCompactNumber(usage.outputTokens)} out
				</div>
			</td>
			<td className="px-3 py-2 text-right">
				<div className="font-medium tabular-nums">{costLabel(usage)}</div>
				<div className="text-[11px] text-neutral-500 tabular-nums">
					{usage.runsWithReportedCost}/{usage.runCount} reported
				</div>
			</td>
		</>
	);
}

function ExecutionTargetLabel({ row }: { row: ProjectUsageExecutionTarget }) {
	if (row.backend === null && row.model === null && row.provider === null) {
		return <Badge tone="neutral">Unknown / legacy</Badge>;
	}
	return (
		<ExecutionIdentityBadges backend={row.backend} model={row.model} provider={row.provider} />
	);
}

function ExecutionBreakdown({ rows }: { rows: ProjectUsageExecutionTarget[] }) {
	return (
		<div className="min-w-0">
			<div className="border-b px-4 py-3 dark:border-neutral-800">
				<h3 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
					By execution target
				</h3>
				<p className="text-xs text-neutral-500">CLI and model combinations.</p>
			</div>
			<div className="overflow-x-auto">
				<table
					aria-label="Project usage by execution target"
					className="w-full text-left text-sm">
					<thead className="border-b bg-neutral-50 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-900">
						<tr>
							<th className="px-3 py-2" scope="col">
								Target
							</th>
							<th className="px-3 py-2 text-right" scope="col">
								Runs
							</th>
							<th className="px-3 py-2 text-right" scope="col">
								Tokens
							</th>
							<th className="px-3 py-2 text-right" scope="col">
								Reported cost
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr
								className="border-b last:border-0 dark:border-neutral-800"
								key={JSON.stringify([row.backend, row.model, row.provider])}>
								<td className="px-3 py-2">
									<ExecutionTargetLabel row={row} />
								</td>
								<UsageMetricCells usage={row} />
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function modeLabel(mode: null | string): string {
	return mode ?? 'Unknown / legacy';
}

function ModeBreakdown({ rows }: { rows: ProjectUsageMode[] }) {
	return (
		<div className="min-w-0 border-t lg:border-t-0 lg:border-l dark:border-neutral-800">
			<div className="border-b px-4 py-3 dark:border-neutral-800">
				<h3 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
					By run mode
				</h3>
				<p className="text-xs text-neutral-500">
					Recorded mode; skill runs commonly use directive.
				</p>
			</div>
			<div className="overflow-x-auto">
				<table aria-label="Project usage by run mode" className="w-full text-left text-sm">
					<thead className="border-b bg-neutral-50 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-900">
						<tr>
							<th className="px-3 py-2" scope="col">
								Mode
							</th>
							<th className="px-3 py-2 text-right" scope="col">
								Runs
							</th>
							<th className="px-3 py-2 text-right" scope="col">
								Tokens
							</th>
							<th className="px-3 py-2 text-right" scope="col">
								Reported cost
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr
								className="border-b last:border-0 dark:border-neutral-800"
								key={row.mode ?? 'unknown'}>
								<td className="px-3 py-2">
									<Badge
										className="capitalize"
										tone={row.mode ? 'cyan' : 'neutral'}>
										{modeLabel(row.mode)}
									</Badge>
								</td>
								<UsageMetricCells usage={row} />
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export function ProjectUsagePanel({ usage }: { usage: ProjectUsageSummary }) {
	const totals = usage.totals;
	const unknownCostRuns = totals.runCount - totals.runsWithReportedCost;
	return (
		<section aria-labelledby="project-usage-heading">
			<Card className="overflow-hidden p-0">
				<div className="border-b px-4 py-3 dark:border-neutral-800">
					<h2
						className="text-sm font-semibold text-neutral-950 dark:text-neutral-50"
						id="project-usage-heading">
						AI usage
					</h2>
					<p className="text-xs text-neutral-500">
						Lifetime totals from this project's finalized .aidd run ledger.
					</p>
				</div>
				{totals.runCount === 0 ? (
					<div className="px-4 py-8 text-center text-sm text-neutral-500">
						No finalized runs available for usage accounting.
					</div>
				) : (
					<>
						<div className="grid gap-px border-b bg-neutral-200 sm:grid-cols-2 xl:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-800">
							<MetricSummary
								detail={`${totals.runsWithReportedCost}/${totals.runCount} runs reported dollars`}
								label="Reported cost"
								value={costLabel(totals)}
							/>
							<MetricSummary
								detail={`${formatCompactNumber(totals.inputTokens)} input · ${formatCompactNumber(totals.outputTokens)} output`}
								label="Total tokens"
								value={formatCompactNumber(totals.totalTokens)}
							/>
							<MetricSummary
								detail={`${formatCompactNumber(totals.reasoningTokens)} reasoning`}
								label="Cached tokens"
								value={formatCompactNumber(totals.cachedTokens)}
							/>
							<MetricSummary
								detail={`${unknownCostRuns} runs have unknown cost`}
								label="Runs with token use"
								value={`${totals.runsWithTokenUsage}/${totals.runCount}`}
							/>
						</div>
						<div className="grid lg:grid-cols-2">
							<ExecutionBreakdown rows={usage.byExecutionTarget} />
							<ModeBreakdown rows={usage.byMode} />
						</div>
						<div className="border-t bg-neutral-50 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/50">
							Reported cost excludes zero-valued remote runs because older providers
							used zero for unknown cost. Cached tokens are part of input; reasoning
							tokens are part of output and are not added twice.
						</div>
					</>
				)}
			</Card>
		</section>
	);
}
