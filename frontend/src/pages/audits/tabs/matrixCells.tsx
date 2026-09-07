import type { FocusEventHandler, KeyboardEventHandler, ReactNode } from 'react';

import type { AuditApplicabilityCell, AuditEffect } from '../../../api/types.ts';
import type { Tone } from '../../../lib/tones.ts';

import { Badge, StatusDot } from '../../../components/ui/badge.tsx';
import { Tooltip } from '../../../components/ui/tooltip.tsx';

interface EffectAppearance {
	className: string;
	showDot: boolean;
	tone: Tone;
}

const effectAppearance: Record<Exclude<AuditEffect, 'default'>, EffectAppearance> = {
	disabled: {
		className: 'text-muted-foreground',
		showDot: false,
		tone: 'neutral',
	},
	excluded: {
		className: 'bg-transparent text-muted-foreground ring-2 ring-control-border',
		showDot: false,
		tone: 'neutral',
	},
	required: {
		className: 'font-semibold',
		showDot: true,
		tone: 'teal',
	},
};

function EffectBadge({
	children,
	effect,
}: {
	children: ReactNode;
	effect: Exclude<AuditEffect, 'default'>;
}) {
	const appearance = effectAppearance[effect];
	return (
		<Badge className={appearance.className} showDot={appearance.showDot} tone={appearance.tone}>
			{children}
		</Badge>
	);
}

function CellProvenance({ cell }: { cell: AuditApplicabilityCell }) {
	return (
		<span className="grid [grid-template-columns:auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-left text-xs">
			<span className="text-muted-foreground">Effect</span>
			<span>{cell.effect}</span>
			<span className="text-muted-foreground">Source</span>
			<span className="font-mono">{cell.source}</span>
			{cell.ruleId ? (
				<>
					<span className="text-muted-foreground">Rule</span>
					<span className="font-mono wrap-anywhere">{cell.ruleId}</span>
				</>
			) : null}
			{cell.conditional ? (
				<span className="col-span-2 border-t border-border pt-1 text-muted-foreground">
					Also constrained by non-bucket facets
				</span>
			) : null}
		</span>
	);
}

/**
 * `default` is roughly 85% of the cells. Rendered as a filled badge it produced six near-identical
 * columns of pills and buried the handful of cells that carry a decision, so the baseline is a muted
 * dot and the badge is reserved for the effects that deviate from it.
 */
export function EffectCell({
	cell,
	id,
	onFocus,
	onKeyDown,
	tabIndex = 0,
}: {
	cell: AuditApplicabilityCell;
	id?: string;
	onFocus?: FocusEventHandler<HTMLSpanElement>;
	onKeyDown?: KeyboardEventHandler<HTMLSpanElement>;
	tabIndex?: -1 | 0;
}) {
	const value =
		cell.effect === 'default' ? (
			<span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
				<StatusDot />
				<span className="sr-only">default</span>
				{cell.conditional ? '*' : ''}
			</span>
		) : (
			<EffectBadge effect={cell.effect}>
				{cell.effect}
				{cell.conditional ? '*' : ''}
			</EffectBadge>
		);
	return (
		<Tooltip content={<CellProvenance cell={cell} />}>
			<span
				className="flex min-h-11 w-full cursor-help items-center justify-start rounded-sm ring-control-border max-sm:ring-1 max-sm:ring-inset xl:justify-center"
				id={id}
				onFocus={onFocus}
				onKeyDown={onKeyDown}
				tabIndex={tabIndex}>
				{value}
			</span>
		</Tooltip>
	);
}

/**
 * The key to the cell vocabulary above. It renders once per tab as its own toolbar row and serves
 * the desktop table and narrow card stack both, rather than being a second `<thead>` row for one
 * and a card of its own for the other.
 */
export function MatrixLegend() {
	return (
		<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
			<span className="inline-flex items-center gap-1">
				<StatusDot />
				default
			</span>
			<EffectBadge effect="required">required</EffectBadge>
			<EffectBadge effect="disabled">disabled</EffectBadge>
			<EffectBadge effect="excluded">excluded</EffectBadge>
			<span>* also constrained by non-bucket facets</span>
		</span>
	);
}
