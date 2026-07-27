import type { ReactNode } from 'react';

import { default as SquareTerminal } from 'lucide-react/dist/esm/icons/square-terminal';
import { useCallback, useRef, useState } from 'react';

import { cn } from '../../lib/cn.ts';
import {
	cleanIdentityValue,
	type ExecutionIdentity,
	type ExecutionIdentityItem,
	executionIdentityItems,
	type ExecutionIdentityKind,
} from '../../lib/executionIdentity.ts';
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
	const [overflowing, setOverflowing] = useState(false);

	const setElement = useCallback(
		(element: HTMLSpanElement | null) => {
			observerRef.current?.disconnect();
			observerRef.current = null;
			if (!element || !withTooltip || label.length === 0) return;
			const measure = () => {
				setOverflowing(element.scrollWidth > element.clientWidth);
			};
			measure();
			const observer = new ResizeObserver(measure);
			observer.observe(element);
			observerRef.current = observer;
		},
		[label, withTooltip],
	);

	const value = (
		<span className={className} ref={setElement}>
			{label}
		</span>
	);
	return withTooltip && overflowing ? <Tooltip content={label}>{value}</Tooltip> : value;
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
			{hint ? <div className="text-neutral-500 dark:text-neutral-400">{hint}</div> : null}
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
		<span
			aria-label={ariaLabel}
			className={cn(
				'inline-flex max-w-full min-w-0 items-stretch overflow-hidden rounded-[3px] bg-muted text-[11px] leading-5 ring-1 ring-border ring-inset focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:focus-visible:ring-teal-300',
				className,
			)}
			role="group">
			{items.map((item, index) => (
				<span
					className={cn(
						'inline-flex min-w-0 items-center gap-1 px-1.5 py-px',
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
						className={
							item.kind === 'model' ? 'inline-block max-w-48 truncate' : undefined
						}
						label={item.label}
						withTooltip={withTooltip && !hasHiddenDetails && item.kind === 'model'}
					/>
				</span>
			))}
		</span>
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
