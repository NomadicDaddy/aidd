import type { ReactNode } from 'react';

import { default as Gauge } from 'lucide-react/dist/esm/icons/gauge';
import { default as SquareTerminal } from 'lucide-react/dist/esm/icons/square-terminal';

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
						'inline-flex items-center gap-1 px-2 py-1',
						// The model is the only segment allowed to shrink. Backend and reasoning
						// effort are short values from bounded vocabularies — `opencode`, `xhigh`
						// — and truncating one leaves nothing: proportional shrink turned
						// `opencode` into `…ode`, which names no backend at all. The model is the
						// segment whose truncation is designed to stay informative, because it
						// loses characters off the head and keeps the discriminating tail.
						item.kind === 'model' ? 'min-w-[4.5rem]' : 'shrink-0',
						index > 0 ? 'border-l border-border' : '',
						itemClass(item),
					)}
					key={item.kind}>
					<ItemIcon kind={item.kind} />
					{compact && item.kind !== 'model' ? null : (
						<span
							className={cn(
								'inline-block min-w-0',
								identityTruncateClass,
								// Compact hands the whole cell to the model, so capping it here
								// would re-create the clipping the variant exists to remove.
								item.kind === 'model' && !compact && 'max-w-48',
							)}>
							<bdi dir="ltr">{item.label}</bdi>
						</span>
					)}
				</span>
			))}
		</Badge>
	);
	// Every identity that is allowed a tooltip gets one, unconditionally.
	//
	// The gate used to be "does this badge hide anything" — a provider, a hint, a segment the
	// compact variant demoted — which assumed the visible segments were legible. They are legible
	// only if the layout gave them room, and the component cannot know that: the badge is
	// `max-w-full`, so its own page decides. On the Badge Lab at 768px that assumption failed and
	// a squeezed backend rendered as `…ode` with a native `title` as its only way back, which is
	// mouse-only — unreachable by touch and unreachable by keyboard.
	//
	// Measuring the clipping instead is what caused React #185 here once already: reveal-on-clip
	// reparents the measured span into Tooltip's `relative inline-flex` wrapper, which changes its
	// clientWidth, which flips the measurement back. An unconditional wrapper has no such feedback
	// path, and it also makes focusability a property of the component rather than of whether a
	// provider happened to be recorded on this particular row.
	return withTooltip ? (
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
