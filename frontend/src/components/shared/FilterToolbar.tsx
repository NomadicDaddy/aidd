import type { ReactNode } from 'react';

import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as SlidersHorizontal } from 'lucide-react/dist/esm/icons/sliders-horizontal';
import { Children, useId, useState } from 'react';

import { cn } from '../../lib/cn.ts';
import { useContentRail } from '../../lib/contentRails.ts';
import { Badge } from '../ui/badge.tsx';
import { Button, IconButton } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { FilterToolbarReadout } from './FilterToolbarReadout.tsx';
import { FilterToolbarStackedActions } from './FilterToolbarStackedActions.tsx';

export function FilterToolbar({
	actionLayout = 'inline',
	actionRole,
	actions,
	activeFilterCount,
	children,
	className,
	columns,
	filtered,
	gap = 'default',
	hasFilters,
	header,
	mobileCountPlacement = 'trigger',
	mobileLayout = 'stacked',
	noun,
	onReset,
	padding = 'default',
	primaryControlCount = 1,
	readoutLabel = 'Showing',
	readoutSuffix,
	total,
}: {
	actionLayout?: 'inline' | 'stacked';
	/** Declares whether the trailing controls act on the page, display, or selected rows. */
	actionRole?: 'bulk' | 'display' | 'page';
	actions?: ReactNode;
	/** Active secondary controls, when the page can report the exact count. */
	activeFilterCount?: number;
	children: ReactNode;
	className?: string;
	/**
	 * The grid template for the control row, e.g.
	 * `@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_1fr_1fr_1fr]`.
	 *
	 * The toolbar is a container. Keep every responsive step on that content-width axis so a page
	 * split or navigation rail cannot make controls narrower when the viewport grows.
	 */
	columns: string;
	filtered: number;
	/** Control and section spacing. Defaults to `default`; use `compact` for dense surfaces. */
	gap?: 'compact' | 'default';
	hasFilters: boolean;
	header?: ReactNode;
	/** Keep the compact count in the Filters trigger, or give it a trailing row position. */
	mobileCountPlacement?: 'row' | 'trigger';
	/** Whether the primary control shares the phone row with the secondary-filter disclosure. */
	mobileLayout?: 'inline' | 'stacked';
	/** What is being counted, already plural: `features`, `runs`, `projects`. */
	noun: string;
	onReset: () => void;
	/** Card inset. Defaults to `default`; use `compact` for dense surfaces. */
	padding?: 'compact' | 'default' | 'roomy';
	/** Number of leading controls that remain outside the phone filter disclosure. */
	primaryControlCount: number;
	readoutLabel?: string;
	/** Extra qualification after the count — the root a projects list is scoped to. */
	readoutSuffix?: ReactNode;
	total: number;
}) {
	const gapClass = gap === 'compact' ? 'gap-2' : 'gap-3 @max-[36rem]:gap-2';
	const paddingClass =
		padding === 'compact' ? 'p-3' : padding === 'roomy' ? 'p-4' : 'p-4 @max-[36rem]:p-3';
	const [filtersOpen, setFiltersOpen] = useState(false);
	const rail = useContentRail();
	const controls = Children.toArray(children);
	const primaryControls = controls.slice(0, primaryControlCount);
	const secondaryControls = controls.slice(primaryControlCount);
	const hasSecondaryControls = secondaryControls.length > 0;
	const mobileFiltersPanelId = useId();
	const mobileFiltersTitleId = useId();
	return (
		<>
			<div className="@container">
				<Card
					className={cn('flex flex-col', gapClass, paddingClass, className)}
					data-content-rail={rail}>
					{header}
					<div
						className={cn(
							'flex flex-col @min-[64rem]:flex-row @min-[64rem]:items-end',
							gapClass,
						)}>
						{/* The Card owns the rail; this grid and the readout share its padding box. */}
						<div
							className={cn(
								'grid min-w-0 flex-1',
								gapClass,
								hasSecondaryControls &&
									'@max-[36rem]:grid-cols-[minmax(0,1fr)_auto] @max-[36rem]:items-end @max-[36rem]:gap-2',
								columns,
							)}>
							{hasSecondaryControls ? (
								<>
									<div
										className={cn(
											'@min-[36rem]:hidden',
											mobileLayout === 'stacked' && '@max-[36rem]:col-span-2',
										)}>
										{primaryControls}
									</div>
									<div
										className={cn(
											'hidden items-center gap-1 @max-[36rem]:flex @max-[36rem]:justify-start',
											mobileLayout === 'stacked' && '@max-[36rem]:col-span-2',
										)}>
										<Button
											aria-controls={mobileFiltersPanelId}
											aria-expanded={filtersOpen}
											aria-haspopup="dialog"
											className={cn(
												'items-start px-2 py-1 text-left',
												mobileCountPlacement === 'trigger' &&
													'flex-col gap-0',
											)}
											onClick={() => setFiltersOpen(true)}>
											<span className="inline-flex items-center gap-1.5">
												<SlidersHorizontal className="h-3.5 w-3.5" />
												Filters
												{activeFilterCount === undefined ||
												activeFilterCount === 0 ? null : (
													<Badge
														aria-hidden="true"
														className="px-1.5 py-0.5"
														tone={
															activeFilterCount > 0
																? 'teal'
																: 'neutral'
														}>
														{activeFilterCount}
													</Badge>
												)}
												{activeFilterCount === undefined ? null : (
													<span className="sr-only">
														{activeFilterCount} active secondary{' '}
														{activeFilterCount === 1
															? 'filter'
															: 'filters'}
													</span>
												)}
											</span>
											{mobileCountPlacement === 'trigger' ? (
												<span className="text-xs font-normal text-muted-foreground tabular-nums">
													<span aria-hidden="true">
														{filtered}/{total}
													</span>
													<span className="sr-only">
														{readoutLabel} {filtered} of {total} {noun}
													</span>
												</span>
											) : null}
										</Button>
										{mobileCountPlacement === 'row' ? (
											<span
												className="ml-auto text-xs text-muted-foreground tabular-nums"
												role="status">
												<span aria-hidden="true">
													{filtered}/{total}
												</span>
												<span className="sr-only">
													{readoutLabel} {filtered} of {total} {noun}
												</span>
											</span>
										) : null}
										<IconButton
											ariaLabel="Reset filters"
											disabled={!hasFilters}
											onClick={onReset}
											variant="ghost">
											<RotateCcw className="h-3.5 w-3.5" />
										</IconButton>
									</div>
									<div className="hidden @min-[36rem]:contents">{controls}</div>
								</>
							) : (
								children
							)}
						</div>
						<FilterToolbarReadout
							actionRole={actionRole}
							actions={actionLayout === 'inline' ? actions : undefined}
							filtered={filtered}
							hasFilters={hasFilters}
							hasMobileFilters={hasSecondaryControls}
							noun={noun}
							onReset={onReset}
							readoutLabel={readoutLabel}
							readoutSuffix={readoutSuffix}
							total={total}
						/>
					</div>
					{actions && actionLayout === 'stacked' ? (
						<FilterToolbarStackedActions actionRole={actionRole} actions={actions} />
					) : null}
				</Card>
			</div>
			{hasSecondaryControls ? (
				<Dialog
					aria-labelledby={mobileFiltersTitleId}
					onClose={() => setFiltersOpen(false)}
					open={filtersOpen}>
					<DialogPanel
						className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto p-5"
						id={mobileFiltersPanelId}>
						<div className="space-y-1">
							<h2
								className="text-lg font-semibold text-foreground"
								id={mobileFiltersTitleId}>
								Filters
							</h2>
							<p className="text-sm text-muted-foreground">
								{activeFilterCount === undefined
									? 'Secondary filter controls'
									: `${activeFilterCount} active secondary ${activeFilterCount === 1 ? 'filter' : 'filters'}`}
							</p>
						</div>
						<div className="mt-4 grid gap-3">{secondaryControls}</div>
						<div className="mt-5 flex items-center justify-between gap-3">
							<Button disabled={!hasFilters} onClick={onReset} variant="ghost">
								<RotateCcw className="h-3 w-3" />
								Reset filters
							</Button>
							<Button onClick={() => setFiltersOpen(false)} variant="primary">
								Show results
							</Button>
						</div>
					</DialogPanel>
				</Dialog>
			) : null}
		</>
	);
}
