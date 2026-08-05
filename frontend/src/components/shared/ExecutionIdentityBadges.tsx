import type { ReactNode } from 'react';

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

function itemClass(item: ExecutionIdentityItem): string {
	return item.kind === 'model'
		? 'font-semibold text-foreground'
		: 'font-medium text-muted-foreground';
}

function itemFieldLabel(kind: ExecutionIdentityKind): string {
	if (kind === 'backend') return 'CLI';
	if (kind === 'model') return 'Model';
	return 'Reasoning';
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
			{label}
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
	withTooltip = true,
}: {
	className?: string;
	hint?: ReactNode;
	withTooltip?: boolean;
} & ExecutionIdentity) {
	const items = executionIdentityItems({ backend, model, provider, reasoningEffort });
	if (items.length === 0) return null;
	const cleanProvider = cleanIdentityValue(provider);
	const hasHiddenDetails = Boolean(cleanProvider || hint);
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
					{item.kind === 'backend' ? (
						<SquareTerminal
							aria-hidden="true"
							className="size-3 shrink-0"
							strokeWidth={2.25}
						/>
					) : null}
					<OverflowIdentityValue
						className={cn(
							'inline-block min-w-0 truncate',
							item.kind === 'model' && 'max-w-48',
						)}
						label={item.label}
						withTooltip={withTooltip && !hasHiddenDetails && item.kind === 'model'}
					/>
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
