import { type ReactNode, useState } from 'react';

import type { InvocationRecord, OutcomeRate, SkillRevisionUsage } from '../../api/types.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useTelemetryResourceDetail } from '../../hooks/useTelemetry.ts';
import { formatCompactNumber, formatDate, formatDuration } from '../../lib/formatters.ts';
import { toneText } from '../../lib/tones.ts';
import { touchTargetRowClass } from '../../lib/touchTarget.ts';
import { microLabelClass } from '../../lib/typography.ts';
import { invocationSourceLabel } from './invocationSource.ts';

/** The one class list both disclosure triggers on this page wear. */
export const inspectTriggerClass = 'text-xs font-medium text-accent hover:underline';

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="min-w-0">
			<dt className={`text-muted-foreground ${microLabelClass}`}>{label}</dt>
			<dd className="mt-0.5 text-xs break-all text-foreground">{value ?? '—'}</dd>
		</div>
	);
}

/**
 * A timestamp, a duration or an exit code.
 *
 * Mono for the same reason the ids beside them are — nothing here is prose — and `tabular-nums`
 * because this grid stacks Started, Completed and Duration in one column, where proportional digits
 * put three timestamps on three different rhythms.
 */
function numeric(value: number | string): ReactNode {
	return <span className="font-mono tabular-nums">{value}</span>;
}

function identifier(value: null | string): ReactNode {
	return value ? <span className="font-mono">{value}</span> : '—';
}

function revisionOutcome(revision: SkillRevisionUsage): string {
	const outcomes = [
		[revision.completed, 'completed'],
		[revision.warnings, 'warnings'],
		[revision.failed, 'failed'],
		[revision.flagged, 'flagged'],
		[revision.stopped, 'stopped'],
		[revision.killed, 'killed'],
		[revision.noWork, 'no work'],
		[revision.running, 'running'],
	] as const;
	return outcomes
		.filter(([count]) => count > 0)
		.map(([count, label]) => `${count} ${label}`)
		.join(' · ');
}

/** Share of inspected runs whose commits were reverted; an em dash until a run has been inspected. */
function revertRateText(rate: OutcomeRate): ReactNode {
	if (rate.denominator === 0 || rate.value === null) return '—';
	return numeric(
		`${Math.round(rate.value * 100)}% · ${rate.numerator}/${rate.denominator} inspected`,
	);
}

export function SkillRevisionComparison({ revisions }: { revisions: SkillRevisionUsage[] }) {
	if (revisions.length === 0) return null;
	return (
		<div className="mt-3 border-t border-border pt-3">
			<h4 className={microLabelClass}>Skill revisions</h4>
			<p className="mt-1 text-xs text-muted-foreground">
				Invocation outcomes and run token totals grouped by the exact skill body.
			</p>
			<div className="mt-2 grid gap-2 @min-[42rem]:grid-cols-2">
				{revisions.map((revision) => (
					<Card
						className="min-w-0 p-3"
						key={revision.resourceSha256 ?? 'not-captured'}
						variant="sunken">
						<div
							className="truncate font-mono text-xs text-foreground"
							title={revision.resourceSha256 ?? 'Revision not captured'}>
							{revision.resourceSha256?.slice(0, 12) ?? 'not captured'}
						</div>
						<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
							<DetailItem label="Invocations" value={numeric(revision.total)} />
							<DetailItem
								label="Average duration"
								value={
									revision.avgDurationMs === null
										? '—'
										: numeric(formatDuration(revision.avgDurationMs))
								}
							/>
							<div className="col-span-2">
								<DetailItem
									label="Outcomes"
									value={revisionOutcome(revision) || '—'}
								/>
							</div>
							<div className="col-span-2">
								<DetailItem
									label="Revert rate"
									value={revertRateText(revision.revertRate)}
								/>
							</div>
							<div className="col-span-2">
								<DetailItem
									label="Tokens"
									value={`${formatCompactNumber(revision.totalTokens)} total · ${formatCompactNumber(revision.inputTokens)} in · ${formatCompactNumber(revision.outputTokens)} out`}
								/>
							</div>
							<div className="col-span-2">
								<DetailItem
									label="Token coverage"
									value={`${revision.runsWithTokenData}/${revision.total} invocations · ${formatCompactNumber(revision.cachedTokens)} cached · ${formatCompactNumber(revision.reasoningTokens)} reasoning`}
								/>
							</div>
						</dl>
					</Card>
				))}
			</div>
		</div>
	);
}

/**
 * The sixteen recorded fields for one invocation.
 *
 * Sized by its container rather than by the viewport. A hard 672px cap is a sound width for the
 * card stack and a wrong one inside a table cell: the Details column is the seventh of seven, so a
 * panel that wide opening inside it pushes the table 282px past its scroller at 1440 and the
 * operator has to scroll sideways to read fields that are already on screen. The table gives it a
 * full-width row of its own and the stack gives it the card's width, so neither caller needs a
 * magic number.
 */
export function InvocationDetailsPanel({ invocation }: { invocation: InvocationRecord }) {
	const effectiveExitCode = invocation.runExitCode ?? invocation.exitCode;
	const resourceDetail = useTelemetryResourceDetail(
		invocation.resourceType,
		invocation.resourceId,
		invocation.resourceType === 'skill',
	);
	// The nested panel differentiates by fill, not by a second border at the card's own weight —
	// the same `sunken` step the dashboard uses for a panel inside a panel.
	return (
		<Card className="@container w-full p-3" variant="sunken">
			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 @min-[61rem]:grid-cols-4">
				<DetailItem label="Invocation ID" value={identifier(invocation.id)} />
				<DetailItem label="Resource name" value={identifier(invocation.resourceName)} />
				<DetailItem label="Resource ID" value={identifier(invocation.resourceId)} />
				<DetailItem label="Resource type" value={invocation.resourceType} />
				<DetailItem label="Project path" value={identifier(invocation.projectPath)} />
				<DetailItem label="Source" value={invocationSourceLabel(invocation.source)} />
				<DetailItem
					label="Arguments supplied"
					value={invocation.argsPresent ? 'Yes — values are not stored' : 'No'}
				/>
				<DetailItem label="Started" value={numeric(formatDate(invocation.startedAt))} />
				<DetailItem
					label="Completed"
					value={
						invocation.completedAt === null
							? '—'
							: numeric(formatDate(invocation.completedAt))
					}
				/>
				<DetailItem
					label="Duration"
					value={
						invocation.durationMs === null
							? '—'
							: numeric(formatDuration(invocation.durationMs))
					}
				/>
				<DetailItem label="Raw invocation status" value={invocation.status} />
				<DetailItem label="Authoritative run status" value={invocation.runStatus} />
				<DetailItem
					label="Exit code"
					value={effectiveExitCode === null ? '—' : numeric(effectiveExitCode)}
				/>
				<DetailItem label="Run ID" value={identifier(invocation.runId)} />
				<DetailItem label="Pipeline session ID" value={identifier(invocation.sessionId)} />
				<DetailItem
					label="Parent invocation ID"
					value={identifier(invocation.parentInvocationId)}
				/>
				<DetailItem
					label="Parent resource"
					value={
						invocation.parentResourceId
							? `${invocation.parentResourceType ?? 'unknown'} · ${invocation.parentResourceId}`
							: '—'
					}
				/>
			</dl>
			{invocation.errorMessage && (
				<div className="mt-3 border-t border-border pt-3">
					{/* Two hand-rolled red pairs where the app has one. The label's light-mode step
						    was the only place in the frontend that red-600 is used for text, and the
						    message's red-800 on the sunken fill measured 4.3:1 against the 4.9:1 the
						    shared token gives at the same size. One token for both lines also stops
						    the label and the message reading as two different severities. */}
					<div className={`${toneText.red} ${microLabelClass}`}>Error message</div>
					<pre
						className={`mt-1 max-h-48 overflow-auto text-xs whitespace-pre-wrap ${toneText.red}`}>
						{invocation.errorMessage}
					</pre>
				</div>
			)}
			{invocation.resourceType === 'skill' ? (
				<SkillRevisionComparison revisions={resourceDetail.data?.revisions ?? []} />
			) : null}
		</Card>
	);
}

/**
 * The card-stack trigger: the panel behind a native `<details>`.
 *
 * The table below `xl` collapses to a stack of cards, where a card is already the full width of the
 * column and there is no row to expand into — so this half keeps the disclosure element it always
 * had, and only the marker changed.
 */
export function InvocationDetails({ invocation }: { invocation: InvocationRecord }) {
	const [open, setOpen] = useState(false);
	return (
		<details className="group" onToggle={(event) => setOpen(event.currentTarget.open)}>
			<summary
				aria-label={`Inspect telemetry for ${invocation.resourceName}`}
				className={`flex cursor-pointer list-none items-center gap-1 marker:content-none ${inspectTriggerClass} ${touchTargetRowClass}`}>
				<DisclosureMarker />
				Inspect
			</summary>
			{open ? (
				<div className="mt-2">
					<InvocationDetailsPanel invocation={invocation} />
				</div>
			) : null}
		</details>
	);
}
