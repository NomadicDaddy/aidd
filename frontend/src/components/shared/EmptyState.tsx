import type { ReactNode } from 'react';

import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';

import type { FilterRegister } from '../../lib/filterFields.ts';

import { cn } from '../../lib/cn.ts';
import { FILTER_FIELD_ORDER } from '../../lib/filterFields.ts';
import { Button } from '../ui/button.tsx';

function fieldRank(label: string): number {
	const index = (FILTER_FIELD_ORDER as readonly string[]).indexOf(label);
	return index === -1 ? FILTER_FIELD_ORDER.length : index;
}

/**
 * The house empty state, and the only place a surface says there is nothing to show.
 *
 * `filters` selects the second of the three registers an empty result can be in. Without it the box
 * asserts absence: nothing of this kind exists yet. With it the box says the operator's own filters
 * produced this, names them, and offers the way back — locally by default, or through a nearby
 * toolbar when `filterReset="toolbar"` assigns ownership there. The two states are told apart by
 * structure rather than by whether a reader notices the difference between "No audits." and "No
 * audits match the current filters." Thirty-odd surfaces already carried distinct copy for the two
 * and it read as one state anyway, because nothing but the wording changed: same box, same silence
 * about what was in force, same walk back to a toolbar that could be most of a screen away.
 *
 * The third register — not loaded yet — is deliberately not a variant here. It belongs to
 * `LoadingState`, and the contract is that this component is terminal: a surface must know its
 * query has resolved before it is entitled to claim there is nothing. `ScheduledPage` is what that
 * costs when it is not enforced; it asserted "Scheduled tasks appear here when they are active"
 * over an undefined query result, which is a claim about data nobody had fetched.
 *
 * Filter labels are ordered by `FILTER_FIELD_ORDER`, the same sequence the toolbars render, so the
 * readout in the empty state and the controls above it cannot disagree about order.
 */
export function EmptyState({
	action,
	children,
	className,
	filterReset = 'local',
	filters,
}: {
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	/** Which surface owns the reset action when a filter register is present. */
	filterReset?: 'local' | 'toolbar';
	filters?: FilterRegister | undefined;
}) {
	const inForce =
		filters === undefined
			? []
			: [...filters.inForce].sort(
					(left, right) => fieldRank(left.label) - fieldRank(right.label),
				);
	const showFilterReset = filters !== undefined && filterReset === 'local';
	const hasFooter = action !== undefined || showFilterReset;
	return (
		<div
			className={cn(
				'rounded-xl border border-dashed border-control-border bg-muted p-4 text-sm text-muted-foreground',
				hasFooter ? 'flex flex-col items-start gap-4' : undefined,
				className,
			)}>
			<div className="space-y-1.5">
				<div>{children}</div>
				{inForce.length > 0 ? (
					<p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
						<span>In force:</span>
						{inForce.map((filter, index) => (
							<span className="inline-flex items-center gap-1" key={filter.label}>
								{index > 0 ? <span aria-hidden="true">·</span> : null}
								<span>{filter.label}</span>
								<code className="rounded bg-background/70 px-1 font-mono text-foreground">
									{filter.value}
								</code>
							</span>
						))}
					</p>
				) : null}
			</div>
			{hasFooter ? (
				<div className="flex flex-wrap gap-4">
					{filters !== undefined && filterReset === 'local' ? (
						<Button onClick={filters.onReset} variant="secondary">
							<RotateCcw className="h-3 w-3" />
							Reset filters
						</Button>
					) : null}
					{action}
				</div>
			) : null}
		</div>
	);
}
