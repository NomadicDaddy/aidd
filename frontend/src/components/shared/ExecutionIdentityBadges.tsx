import type { ReactNode } from 'react';

import { default as Gauge } from 'lucide-react/dist/esm/icons/gauge';
import { default as SquareTerminal } from 'lucide-react/dist/esm/icons/square-terminal';
import { useCallback, useRef } from 'react';

import { cn } from '../../lib/cn.ts';
import {
	cleanIdentityValue,
	type ExecutionIdentity,
	type ExecutionIdentityItem,
	executionIdentityItems,
	type ExecutionIdentityKind,
} from '../../lib/executionIdentity.ts';
import { Badge } from '../ui/badge.tsx';
import { Tooltip } from '../ui/tooltip.tsx';

export type { ExecutionIdentity } from '../../lib/executionIdentity.ts';

/**
 * Truncate from the head, because the discriminating part of a machine identifier is its tail.
 *
 * `claude-opus-5` and `claude-fable-5` share eleven of thirteen characters; tail-truncating both to
 * a narrow cell produces `claude-o…` and `claude-f…`, which is a coin flip, while head-truncating
 * produces `…opus-5` and `…fable-5`, which is the answer. `direction: rtl` moves the overflow to
 * the logical end — visually the left — and `text-left` keeps the run where the reader expects it.
 *
 * The label itself goes inside a `<bdi dir="ltr">`. Leaving it bare is not safe: in an RTL box a
 * neutral character between a letter and a digit resolves to the surrounding direction, so
 * `glm-5.2` can render its hyphen on the wrong side of the number. The isolate makes the whole
 * value one LTR run whatever it contains, and the box around it still ellipsises at the left.
 */
export const identityTruncateClass = 'truncate text-left [direction:rtl]';

function itemClass(item: ExecutionIdentityItem): string {
	// Every segment is a value copied verbatim out of configuration — `codex`, `gpt-5.6-sol`,
	// `xhigh` — and none of them is prose. Geist Sans rendered them as though they were.
	return item.kind === 'model'
		? 'font-mono font-semibold text-foreground'
		: 'font-mono font-medium text-muted-foreground';
}

function itemFieldLabel(kind: ExecutionIdentityKind): string {
	if (kind === 'backend') return 'CLI';
	if (kind === 'model') return 'Model';
	return 'Reasoning';
}

function ItemIcon({ kind }: { kind: ExecutionIdentityKind }) {
	if (kind === 'backend')
		return <SquareTerminal aria-hidden="true" className="size-3 shrink-0" strokeWidth={2.25} />;
	if (kind === 'reasoning')
		return <Gauge aria-hidden="true" className="size-3 shrink-0" strokeWidth={2.25} />;
	return null;
}

// Truncation is measured, but the result MUST NOT re-render this span. Wrapping the measured
// element in <Tooltip> reparents it into a `relative inline-flex` span, which changes its
// clientWidth, which flips the measurement back, which unwraps it again — an unbounded update
// loop (React error #185, "Maximum update depth exceeded") that took the whole Runs page down.
// Setting the native title imperatively keeps the measured box independent of the outcome, so the
// "reveal the full value only when it is actually clipped" behaviour cannot feed back on itself.
function OverflowIdentityValue({
	className,
	label,
	withTooltip,
}: {
	className?: string | undefined;
	label: string;
	withTooltip: boolean;
}) {
	const observerRef = useRef<null | ResizeObserver>(null);

	const setElement = useCallback(
		(element: HTMLSpanElement | null) => {
			observerRef.current?.disconnect();
			observerRef.current = null;
			if (!element) return;
			if (!withTooltip || label.length === 0) {
				element.removeAttribute('title');
				return;
			}
			const measure = () => {
				if (element.scrollWidth > element.clientWidth) element.title = label;
				else element.removeAttribute('title');
			};
			measure();
			const observer = new ResizeObserver(measure);
			observer.observe(element);
			observerRef.current = observer;
		},
		[label, withTooltip],
	);

	return (
		<span className={className} ref={setElement}>
			<bdi dir="ltr">{label}</bdi>
		</span>
	);
}

export function ExecutionIdentityDetails({
	backend,
	hint,
	model,
	provider,
	reasoningEffort,
}: { hint?: ReactNode } & ExecutionIdentity) {
	const items = executionIdentityItems({ backend, model, provider, reasoningEffort });
	const cleanProvider = cleanIdentityValue(provider);
	return (
		<div className="space-y-2 text-left">
			<dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
				{items.map((item) => (
					<div className="contents" key={item.kind}>
						<dt className="font-medium">{itemFieldLabel(item.kind)}</dt>
						<dd className="min-w-0 break-all">{item.label}</dd>
					</div>
				))}
				{cleanProvider ? (
					<div className="contents">
						<dt className="font-medium">Provider</dt>
						<dd className="min-w-0 break-all">{cleanProvider}</dd>
					</div>
				) : null}
			</dl>
			{hint ? <div className="text-muted-foreground">{hint}</div> : null}
		</div>
	);
}

export function ExecutionIdentityBadges({
	backend,
	className,
	hint,
	model,
	provider,
	reasoningEffort,
	variant = 'default',
	withTooltip = true,
}: {
	className?: string;
	hint?: ReactNode;
	/**
	 * `compact` is for a table cell with a fixed budget. It keeps the model label whole and demotes
	 * backend and reasoning effort to their icons, whose values move into the tooltip — three
	 * segments sharing 179px produced `co…  gpt-5…  hi…`, which names none of the three.
	 */
	variant?: 'compact' | 'default';
	withTooltip?: boolean;
} & ExecutionIdentity) {
	const items = executionIdentityItems({ backend, model, provider, reasoningEffort });
	if (items.length === 0) return null;
	const compact = variant === 'compact';
	const cleanProvider = cleanIdentityValue(provider);
	// A demoted segment is a hidden detail like any other, so it takes the same route out.
	const demotesLabels = compact && items.some((item) => item.kind !== 'model');
	const hasHiddenDetails = Boolean(cleanProvider || hint) || demotesLabels;
	const ariaLabel = items
		.map((item) => `${itemFieldLabel(item.kind)} ${item.label}`)
		.concat(cleanProvider ? [`Provider ${cleanProvider}`] : [])
		.concat(typeof hint === 'string' && hint.trim() ? [hint.trim()] : [])
		.join(', ');
	const badges = (
		<Badge
			aria-label={ariaLabel}
			className={cn('max-w-full min-w-0 items-stretch gap-0 overflow-hidden p-0', className)}
			role="group">
			{items.map((item, index) => (
				<span
					className={cn(
						'inline-flex min-w-0 items-center gap-1 px-2 py-1',
						index > 0 ? 'border-l border-border' : '',
						itemClass(item),
					)}
					key={item.kind}>
					<ItemIcon kind={item.kind} />
					{compact && item.kind !== 'model' ? null : (
						<OverflowIdentityValue
							className={cn(
								'inline-block min-w-0',
								identityTruncateClass,
								// Compact hands the whole cell to the model, so capping it here
								// would re-create the clipping the variant exists to remove.
								item.kind === 'model' && !compact && 'max-w-48',
							)}
							label={item.label}
							// Every segment, not just the model: a clipped backend used to be
							// unrecoverable by any means because only the model carried a title.
							withTooltip={withTooltip && !hasHiddenDetails}
						/>
					)}
				</span>
			))}
		</Badge>
	);
	return withTooltip && hasHiddenDetails ? (
		<Tooltip
			content={
				<ExecutionIdentityDetails
					backend={backend}
					hint={hint}
					model={model}
					provider={provider}
					reasoningEffort={reasoningEffort}
				/>
			}>
			{badges}
		</Tooltip>
	) : (
		badges
	);
}
