import type { ReactNode, Ref } from 'react';

import { default as Gauge } from 'lucide-react/dist/esm/icons/gauge';
import { default as SquareTerminal } from 'lucide-react/dist/esm/icons/square-terminal';

import {
	backendHasDisplayLabel,
	backendLabel,
	providerHasDisplayLabel,
	providerLabel,
} from '../../lib/backends.ts';
import { cn } from '../../lib/cn.ts';
import {
	cleanIdentityValue,
	type ExecutionIdentity,
	type ExecutionIdentityItem,
	executionIdentityItems,
	type ExecutionIdentityKind,
} from '../../lib/executionIdentity.ts';
import { touchTargetCompactBoxClass } from '../../lib/touchTarget.ts';
import { Badge } from '../ui/badge.tsx';
import { Tooltip } from '../ui/tooltip.tsx';

export type { ExecutionIdentity } from '../../lib/executionIdentity.ts';

/**
 * Preserve the identifying family at the start of a machine identifier.
 *
 * A constrained model still needs to read `gpt-5…`, `claude-…`, or `glm-5…`; keeping only a
 * version suffix makes different model families indistinguishable. The LTR isolate keeps neutral
 * punctuation such as the hyphen in `glm-5.3` ordered correctly while ordinary tail truncation
 * keeps the family visible.
 */
export const identityTruncateClass = 'truncate text-left';

type DisplayExecutionIdentityItem = {
	displayLabel: string;
	machineValue: boolean;
} & ExecutionIdentityItem;

function itemClass(item: DisplayExecutionIdentityItem): string {
	// The CLI segment is a human product label (`Codex`, `Claude Code`, `Direct AI`), while model
	// and reasoning remain verbatim configuration values. Typeface carries that distinction even
	// when colour and weight are unavailable.
	if (!item.machineValue) return 'font-medium text-muted-foreground';
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
		return (
			<SquareTerminal
				aria-hidden="true"
				className="size-3 shrink-0 max-sm:hidden"
				strokeWidth={2.25}
			/>
		);
	if (kind === 'reasoning')
		return (
			<Gauge
				aria-hidden="true"
				className="size-3 shrink-0 max-sm:hidden"
				strokeWidth={2.25}
			/>
		);
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
						<dd
							className={cn(
								'min-w-0 break-all',
								item.kind === 'backend' && backendHasDisplayLabel(item.label)
									? 'font-sans'
									: 'font-mono',
							)}>
							{item.kind === 'backend' ? backendLabel(item.label) : item.label}
						</dd>
					</div>
				))}
				{cleanProvider ? (
					<div className="contents">
						<dt className="font-medium">Provider</dt>
						<dd
							className={cn(
								'min-w-0 break-all',
								providerHasDisplayLabel(cleanProvider) ? 'font-sans' : 'font-mono',
							)}>
							{providerLabel(cleanProvider)}
						</dd>
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
	compactReasoningLabel = false,
	hint,
	model,
	paintedRef,
	provider,
	reasoningEffort,
	variant = 'default',
	withTooltip = true,
}: {
	className?: string;
	/** Tighten a retained reasoning label when a table gives the segment a narrow fixed budget. */
	compactReasoningLabel?: boolean;
	hint?: ReactNode;
	/** Exposes the painted badge for layout diagnostics without including transparent hit slop. */
	paintedRef?: Ref<HTMLSpanElement>;
	/**
	 * `compact` is for a table cell with a fixed budget. It removes the default label floors while
	 * retaining every available identity fact as visible, independently truncatable text.
	 */
	variant?: 'compact' | 'default';
	withTooltip?: boolean;
} & ExecutionIdentity) {
	const items: DisplayExecutionIdentityItem[] = executionIdentityItems({
		backend,
		model,
		provider,
		reasoningEffort,
	}).map((item) => ({
		...item,
		displayLabel: item.kind === 'backend' ? backendLabel(item.label) : item.label,
		machineValue: item.kind !== 'backend' || !backendHasDisplayLabel(item.label),
	}));
	if (items.length === 0) return null;
	const compact = variant === 'compact';
	const constrainedCompact = compact && items.length > 1;
	const cleanProvider = cleanIdentityValue(provider);
	const ariaLabel = items
		.map((item) => `${itemFieldLabel(item.kind)} ${item.displayLabel}`)
		.concat(cleanProvider ? [`Provider ${providerLabel(cleanProvider)}`] : [])
		.concat(typeof hint === 'string' && hint.trim() ? [hint.trim()] : [])
		.join(', ');
	const badge = (
		<Badge
			aria-label={withTooltip ? undefined : ariaLabel}
			casing="preserve"
			className={cn(
				'max-w-full min-w-0 items-stretch gap-0 overflow-hidden p-0',
				constrainedCompact && 'w-full',
				// Only the ones that actually hold more. The Badge Lab renders 34 chips in one
				// treatment of which 10 are keyboard-focusable tooltip triggers, and at rest they
				// were pixel-identical to the 24 inert ones: same fill, `cursor: auto`, no hover
				// response. The accent ring is present at rest for a coarse pointer, where neither
				// cursor nor hover exists, and remains a hover step for fine pointers.
				// The visual affordance stays on the painted 24px badge. The interactive wrapper
				// below owns the larger hit area, so adding touch access does not turn a compact
				// identity into the visually heaviest item in its row.
				withTooltip &&
					'coarse-interactive-ring transition-shadow group-hover:ring-accent/40',
				className,
			)}
			ref={paintedRef}
			role={withTooltip ? undefined : 'group'}>
			{items.map((item, index) => {
				return (
					<span
						className={cn(
							'inline-flex min-w-0 items-center gap-1 px-2 py-1',
							constrainedCompact && 'gap-0 px-0.5',
							compactReasoningLabel &&
								!constrainedCompact &&
								item.kind === 'reasoning' &&
								'px-1.5',
							// The default variant preserves the established shrink order. A compact
							// multi-field badge divides its real budget between the variable values;
							// no long model or reasoning floor can starve another identity field.
							constrainedCompact && item.kind === 'backend' && 'shrink-0',
							constrainedCompact && item.kind !== 'backend' && 'flex-auto',
							!compact && item.kind === 'backend' && 'shrink-0',
							!compact && item.kind === 'model' && 'min-w-[4.5rem]',
							!compact && item.kind === 'reasoning' && 'max-w-32 shrink-[2]',
							index > 0 ? 'border-l border-control-border' : '',
							itemClass(item),
						)}
						key={item.kind}>
						{constrainedCompact ? null : <ItemIcon kind={item.kind} />}
						<span
							className={cn(
								'inline-block min-w-0',
								identityTruncateClass,
								// Compact lets every fact share the column without carrying the
								// default variant's model cap or label floors.
								item.kind === 'model' && !compact && 'max-w-48',
							)}>
							<bdi dir="ltr">{item.displayLabel}</bdi>
						</span>
					</span>
				);
			})}
		</Badge>
	);
	// Every identity that is allowed a tooltip gets one, unconditionally.
	//
	// Gating it on "does this badge hide anything" — a provider, a hint, or a constrained segment —
	// would assume the visible segments are legible. They are legible only if
	// the layout gave them room, and the component cannot know that: the badge is `max-w-full`,
	// so its own page decides. A squeezed backend can render as only a short identifying prefix,
	// and a native `title` as its only way back is mouse-only — unreachable by touch and
	// unreachable by keyboard.
	//
	// Measuring the clipping instead is what caused React #185 here once already: reveal-on-clip
	// reparents the measured span into Tooltip's `relative inline-flex` wrapper, which changes its
	// clientWidth, which flips the measurement back. An unconditional wrapper has no such feedback
	// path, and it also makes focusability a property of the component rather than of whether a
	// provider happened to be recorded on this particular row. The unpainted target around the
	// badge owns that explicit stop;
	// Tooltip only enhances a trigger's existing keyboard contract and never manufactures one.
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
			<span
				aria-label={ariaLabel}
				className={cn(
					'group max-w-full min-w-0 cursor-help max-sm:max-w-[calc(100%+1.25rem)]',
					constrainedCompact && 'w-full',
					touchTargetCompactBoxClass,
				)}
				role="group"
				tabIndex={0}>
				{badge}
			</span>
		</Tooltip>
	) : (
		badge
	);
}
