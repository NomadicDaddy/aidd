import { useState } from 'react';

import type {
	ProjectUsageExecutionTarget,
	ProjectUsageMode,
	ProjectUsageSummary,
	ProjectUsageTotals,
} from '../../../api/types.ts';

import { DisclosureMarker } from '../../../components/shared/DisclosureMarker.tsx';
import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { formatCompactNumber } from '../../../lib/formatters.ts';
import {
	contentSizedTableClass,
	interactiveTableRowClass,
	tableColumnClass,
	tableHeadClass,
} from '../../../lib/tableStyles.ts';
import { microLabelClass } from '../../../lib/typography.ts';
import { formatReportedCost } from '../projects-list-shared.ts';
import { UsageTableColumns } from './UsageTableColumns.tsx';

function costLabel(usage: ProjectUsageTotals): string {
	return formatReportedCost(usage);
}
function MetricSummary({ detail, label, value }: { detail: string; label: string; value: string }) {
	return (
		<div className="min-w-0 bg-card px-4 py-3">
			<div className={`text-muted-foreground ${microLabelClass}`}>{label}</div>
			<div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
			<div className="mt-1 text-xs text-muted-foreground">{detail}</div>
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
				<div className="text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
					{formatCompactNumber(usage.inputTokens)} in ·{' '}
					{formatCompactNumber(usage.outputTokens)} out
				</div>
			</td>
			<td className="px-3 py-2 text-right">
				<div className="font-medium tabular-nums">{costLabel(usage)}</div>
				<div className="text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
					{usage.runsWithReportedCost}/{usage.runCount} reported
				</div>
			</td>
		</>
	);
}

function UsageMetricFields({ usage }: { usage: ProjectUsageTotals }) {
	return (
		<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
			<div>
				<dt className={`text-muted-foreground ${microLabelClass}`}>Runs</dt>
				<dd className="mt-0.5 font-medium tabular-nums">{usage.runCount}</dd>
			</div>
			<div>
				<dt className={`text-muted-foreground ${microLabelClass}`}>Tokens</dt>
				<dd className="mt-0.5 font-medium tabular-nums">
					{formatCompactNumber(usage.totalTokens)}
				</dd>
				<dd className="text-2xs text-muted-foreground tabular-nums">
					{formatCompactNumber(usage.inputTokens)} in ·{' '}
					{formatCompactNumber(usage.outputTokens)} out
				</dd>
			</div>
			<div>
				<dt className={`text-muted-foreground ${microLabelClass}`}>Reported cost</dt>
				<dd className="mt-0.5 font-medium tabular-nums">{costLabel(usage)}</dd>
				<dd className="text-2xs text-muted-foreground tabular-nums">
					{usage.runsWithReportedCost}/{usage.runCount} reported
				</dd>
			</div>
		</dl>
	);
}

function ExecutionTargetLabel({ row }: { row: ProjectUsageExecutionTarget }) {
	if (row.backend === null && row.model === null && row.provider === null) {
		return <Badge tone="neutral">Unknown</Badge>;
	}
	return (
		<ExecutionIdentityBadges backend={row.backend} model={row.model} provider={row.provider} />
	);
}

function ExecutionBreakdown({ rows }: { rows: ProjectUsageExecutionTarget[] }) {
	return (
		<div className="min-w-0">
			<CardHeader
				className="mb-0 border-b border-border px-4 py-3"
				description="CLI and model combinations."
				headingLevel={3}
				level="subsection"
				title="By execution target"
			/>
			<div className="space-y-2 p-4 lg:hidden">
				{rows.map((row) => (
					<div
						className="rounded-md border border-border p-3"
						key={JSON.stringify([row.backend, row.model, row.provider])}>
						<ExecutionTargetLabel row={row} />
						<UsageMetricFields usage={row} />
					</div>
				))}
			</div>
			<OverflowScroller
				ariaLabel="Project usage by execution target"
				className="hidden lg:block">
				<table
					aria-label="Project usage by execution target"
					className={contentSizedTableClass}>
					<UsageTableColumns />
					<thead className={tableHeadClass}>
						<tr>
							<th className="px-3 py-2" scope="col">
								Target
							</th>
							<th className="px-3 py-2 text-right whitespace-nowrap" scope="col">
								Runs
							</th>
							<th className="px-3 py-2 text-right whitespace-nowrap" scope="col">
								Tokens
							</th>
							<th className="px-3 py-2 text-right whitespace-nowrap" scope="col">
								Reported cost
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr
								className={`border-b border-border last:border-0 ${interactiveTableRowClass}`}
								key={JSON.stringify([row.backend, row.model, row.provider])}>
								<td className="px-3 py-2">
									<ExecutionTargetLabel row={row} />
								</td>
								<UsageMetricCells usage={row} />
							</tr>
						))}
					</tbody>
				</table>
			</OverflowScroller>
		</div>
	);
}

function modeLabel(mode: null | string): string {
	return mode ?? 'Unknown';
}

function ModeBreakdown({ rows }: { rows: ProjectUsageMode[] }) {
	return (
		<div className="min-w-0 border-t border-border">
			<CardHeader
				className="mb-0 border-b border-border px-4 py-3"
				description="Recorded mode; skill runs commonly use directive."
				headingLevel={3}
				level="subsection"
				title="By run mode"
			/>
			<div className="space-y-2 p-4 lg:hidden">
				{rows.map((row) => (
					<div
						className="rounded-md border border-border p-3"
						key={row.mode ?? 'unknown'}>
						<Badge tone="neutral">{modeLabel(row.mode)}</Badge>
						<UsageMetricFields usage={row} />
					</div>
				))}
			</div>
			<OverflowScroller ariaLabel="Project usage by run mode" className="hidden lg:block">
				<table aria-label="Project usage by run mode" className={contentSizedTableClass}>
					<UsageTableColumns />
					<thead className={tableHeadClass}>
						<tr>
							<th className="px-3 py-2" scope="col">
								Mode
							</th>
							<th className="px-3 py-2 text-right whitespace-nowrap" scope="col">
								Runs
							</th>
							<th className="px-3 py-2 text-right whitespace-nowrap" scope="col">
								Tokens
							</th>
							<th className="px-3 py-2 text-right whitespace-nowrap" scope="col">
								Reported cost
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr
								className={`border-b border-border last:border-0 ${interactiveTableRowClass}`}
								key={row.mode ?? 'unknown'}>
								<td className="px-3 py-2">
									<Badge tone="neutral">{modeLabel(row.mode)}</Badge>
								</td>
								<UsageMetricCells usage={row} />
							</tr>
						))}
					</tbody>
				</table>
			</OverflowScroller>
		</div>
	);
}

export function ProjectUsagePanel({ usage }: { usage: ProjectUsageSummary }) {
	const [breakdownOpen, setBreakdownOpen] = useState(false);
	const totals = usage.totals;
	const unknownCostRuns = totals.runCount - totals.runsWithReportedCost;
	const runsWithoutTokenUse = totals.runCount - totals.runsWithTokenUsage;
	const cachedInputShare =
		totals.inputTokens > 0 ? Math.round((totals.cachedTokens / totals.inputTokens) * 100) : 0;
	return (
		<section aria-labelledby="project-usage-heading" className="@container">
			<Card className={`overflow-hidden p-0 ${tableColumnClass}`}>
				<CardHeader
					className="mb-0 border-b border-border px-4 py-3"
					description="Lifetime totals from finalized Runs in this project's .aidd ledger; the latest entry for each Run ID is counted."
					headingLevel={3}
					id="project-usage-heading"
					title="AI usage"
				/>
				{totals.runCount === 0 ? (
					<div className="px-4 py-8 text-center text-sm text-muted-foreground">
						No finalized runs available for usage accounting.
					</div>
				) : (
					<>
						<div className="grid gap-px border-b border-border bg-muted @min-[32rem]:grid-cols-2 @min-[61rem]:grid-cols-4">
							<MetricSummary
								detail={`${totals.runsWithReportedCost}/${totals.runCount} runs reported dollars · ${unknownCostRuns} unknown`}
								label="Reported cost"
								value={costLabel(totals)}
							/>
							<MetricSummary
								detail={`${formatCompactNumber(totals.inputTokens)} input · ${formatCompactNumber(totals.outputTokens)} output · ${formatCompactNumber(totals.reasoningTokens)} reasoning`}
								label="Total tokens"
								value={formatCompactNumber(totals.totalTokens)}
							/>
							<MetricSummary
								detail={`${cachedInputShare}% of input tokens`}
								label="Cached tokens"
								value={formatCompactNumber(totals.cachedTokens)}
							/>
							<MetricSummary
								detail={`${runsWithoutTokenUse} without token usage`}
								label="Runs with token use"
								value={`${totals.runsWithTokenUsage}/${totals.runCount}`}
							/>
						</div>
						<div className="border-b border-border p-3 sm:hidden">
							<Button
								aria-expanded={breakdownOpen}
								className="w-full justify-between"
								onClick={() => setBreakdownOpen((current) => !current)}
								variant="secondary">
								<span>
									Usage breakdown · {usage.byExecutionTarget.length} targets ·{' '}
									{usage.byMode.length} modes
								</span>
								<DisclosureMarker open={breakdownOpen} />
							</Button>
						</div>
						<div className={breakdownOpen ? 'block' : 'hidden sm:block'}>
							<ExecutionBreakdown rows={usage.byExecutionTarget} />
							<ModeBreakdown rows={usage.byMode} />
						</div>
						<div className="border-t border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
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
