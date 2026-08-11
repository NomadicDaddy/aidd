import type { ReactNode } from 'react';

import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';

import type { InvocationRecord } from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { formatDate, formatDuration } from '../../lib/formatters.ts';
import { toneText } from '../../lib/tones.ts';
import { microLabelClass } from '../../lib/typography.ts';

/** The one class list both disclosure triggers on this page wear. */
export const inspectTriggerClass = 'text-xs font-medium text-accent hover:underline';

/**
 * The chevron that both triggers wear, rotated when the panel is open.
 *
 * The table's trigger is a button and the card stack's is a `<summary>`, so one of them can be told
 * its state directly and the other has to read `group-open` off its `<details>`. The icon is the
 * same either way — before this the stack kept the browser's native '▶' tinted teal by the
 * inherited `text-accent` while the privacy card two screens up drew a literal '›', which made two
 * unrelated affordances for one gesture on a single page.
 */
export function InspectChevron({ open }: { open?: boolean }) {
	return (
		<ChevronRight
			className={`inline-block h-3 w-3 transition-transform ${open === undefined ? 'group-open:rotate-90' : open ? 'rotate-90' : ''}`}
		/>
	);
}

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

/**
 * The sixteen recorded fields for one invocation.
 *
 * Sized by its container rather than by the viewport. It used to carry a hard 672px cap, which is a
 * sound width for the card stack it was written for and a wrong one inside a table cell: the
 * Details column is the seventh of seven, so a panel that wide opening inside it pushed the table
 * 282px past its scroller at 1440 and the operator had to scroll sideways to read fields that were
 * already on screen. The table now gives it a full-width row of its own and the stack gives it the
 * card's width, so neither caller needs a magic number.
 */
export function InvocationDetailsPanel({ invocation }: { invocation: InvocationRecord }) {
	const effectiveExitCode = invocation.runExitCode ?? invocation.exitCode;
	// The nested panel differentiates by fill, not by a second border at the card's own weight —
	// the same `sunken` step the dashboard uses for a panel inside a panel.
	return (
		<Card className="w-full p-3" variant="sunken">
			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<DetailItem label="Invocation ID" value={identifier(invocation.id)} />
				<DetailItem label="Resource ID" value={identifier(invocation.resourceId)} />
				<DetailItem label="Resource type" value={invocation.resourceType} />
				<DetailItem label="Project path" value={identifier(invocation.projectPath)} />
				<DetailItem label="Source" value={invocation.source} />
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
	return (
		<details className="group">
			<summary
				aria-label={`Inspect telemetry for ${invocation.resourceName}`}
				className={`flex cursor-pointer list-none items-center gap-1 marker:content-none ${inspectTriggerClass}`}>
				<InspectChevron />
				Inspect
			</summary>
			<div className="mt-2">
				<InvocationDetailsPanel invocation={invocation} />
			</div>
		</details>
	);
}
