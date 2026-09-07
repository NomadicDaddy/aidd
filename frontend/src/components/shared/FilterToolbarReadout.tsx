import type { ReactNode } from 'react';

import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';

import { cn } from '../../lib/cn.ts';
import { Button } from '../ui/button.tsx';

interface FilterToolbarReadoutBaseProps {
	actionRole?: 'bulk' | 'display' | 'page' | undefined;
	actions?: ReactNode;
	className?: string;
	filtered: number;
	hasMobileFilters?: boolean;
	noun: string;
	readoutLabel?: string;
	readoutSuffix?: ReactNode;
	responsiveScope?: 'container' | 'viewport';
	total: number;
}

type FilterToolbarReadoutResetProps =
	{ hasFilters: boolean; onReset: () => void } | { hasFilters?: never; onReset?: never };

type FilterToolbarReadoutProps = FilterToolbarReadoutBaseProps & FilterToolbarReadoutResetProps;

export function FilterToolbarReadout({
	actionRole,
	actions,
	className,
	filtered,
	hasFilters,
	hasMobileFilters = false,
	noun,
	onReset,
	readoutLabel = 'Showing',
	readoutSuffix,
	responsiveScope = 'container',
	total,
}: FilterToolbarReadoutProps) {
	const hasActions = actions !== undefined && actions !== null;
	const compactAlignment =
		responsiveScope === 'viewport'
			? 'max-sm:ml-0 max-sm:justify-start'
			: '@max-[36rem]:ml-0 @max-[36rem]:justify-start';
	const compactHidden = responsiveScope === 'viewport' ? 'max-sm:hidden' : '@max-[36rem]:hidden';
	const compactInline =
		responsiveScope === 'viewport' ? 'hidden max-sm:inline' : 'hidden @max-[36rem]:inline';
	const wideScreenReaderOnly =
		responsiveScope === 'viewport' ? 'sr-only sm:hidden' : 'sr-only @min-[36rem]:hidden';
	const resetLabelClass =
		responsiveScope === 'viewport' ? 'max-sm:sr-only' : '@max-[36rem]:sr-only';
	return (
		// With a mobile filter disclosure in play the whole trailing group is off below 36rem,
		// actions included: the count is already in the disclosure trigger's sub-line and the
		// actions are in its dialog, so leaving this row on restated the count in two places and
		// stranded a 64px control below it. Exempting the actions was what kept it visible.
		<div
			className={cn(
				'ml-auto flex max-w-full shrink-0 items-center justify-end gap-3 text-xs text-muted-foreground tabular-nums',
				// The end of the filter row, until the row is one column and there is no end to sit
				// at. Both halves are needed because this renders two ways: as a flex item beside
				// the controls it wraps under (ml-auto is what strands it), and standalone above a
				// dashboard table with no controls at all (block-level, so justify-end is). Measured
				// on the dashboard at 390: five captions alone on their line, 107-187px of a 324px
				// card. The wide alignment is untouched, which is where the desktop run measured it.
				compactAlignment,
				className,
			)}
			data-slot="filter-toolbar-trailing">
			{hasActions ? (
				<div
					className="flex flex-wrap items-center justify-end gap-2"
					data-action-role={actionRole}
					data-slot="actions">
					{actions}
				</div>
			) : null}
			<div
				className={cn(
					'flex shrink-0 items-center justify-end gap-2',
					hasMobileFilters && '@max-[36rem]:hidden',
				)}
				data-slot="readout-reset">
				<span role="status">
					<span className={compactHidden}>
						{readoutLabel} {filtered} of {total} {noun}
						{readoutSuffix}
					</span>
					<span aria-hidden="true" className={compactInline}>
						{filtered}/{total}
					</span>
					<span className={wideScreenReaderOnly}>
						{readoutLabel} {filtered} of {total} {noun}
						{readoutSuffix}
					</span>
				</span>
				{onReset ? (
					// Stay mounted while disabled so the first filter edit does not reflow the row.
					<Button
						aria-label="Reset filters"
						disabled={hasFilters !== true}
						onClick={onReset}
						variant="ghost">
						<RotateCcw className="h-3 w-3" />
						<span className={resetLabelClass}>Reset filters</span>
					</Button>
				) : null}
			</div>
		</div>
	);
}
