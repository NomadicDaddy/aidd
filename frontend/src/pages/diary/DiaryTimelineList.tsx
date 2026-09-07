import type { CSSProperties, ReactNode } from 'react';

import { useId, useState } from 'react';
import { Link } from 'react-router';

import type { DiaryTimelineItem } from '../../api/types.ts';
import type { DiaryKindFilter } from './diaryFilters.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { classifyDiaryTimelineRun } from '../../components/shared/local-aidd-history/outcome.ts';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { formatDate, formatTimeOfDay, humanizeEnum } from '../../lib/formatters.ts';
import { timelineItemTone, timelineKindLabel } from './diaryItems.ts';
import { DiaryKindIcon } from './DiaryKindIcon.tsx';
import {
	diaryTimelineColumns,
	type DiaryTimelineColumns,
	diaryTimelineGridColumns,
} from './diaryTimelineColumns.ts';
import { DiaryTimelineDetail } from './DiaryTimelineDetail.tsx';
import {
	displayedTitle,
	isDateOnly,
	isoFromMs,
	metaParts,
	rowLinkLabel,
} from './diaryTimelineRowText.ts';

/**
 * The column template, owned by the feed and shared by every day and row through subgrids.
 *
 * The kind and status tracks were a flat `4rem` and `6rem` holding a `w-16`/`w-24` span, and `Badge`
 * is inline-flex, `whitespace-nowrap`, and never clipped — so a label wider than its track simply
 * painted over the next column, which "Completed · warnings" did on eleven rows at 2250x1309.
 *
 * Widening those numbers is not the fix: it moves the threshold to the next longer label, and the
 * label set is not closed — `classifyRunWithWarnings` composes its own strings at runtime. The
 * property to hold is that no label length can overpaint, so the tracks size to their content.
 *
 * `max-content` is only usable because the grid is now the feed rather than the row or day. Each
 * list used to resolve the content-sized track independently, so titles started at a different x
 * between days. The nested subgrids share one set of track lines across the whole visible corpus.
 */
export function DiaryTimelineGrid({
	children,
	kindFilter,
	showProject,
}: {
	children: ReactNode;
	kindFilter: DiaryKindFilter;
	showProject: boolean;
}) {
	const columns = diaryTimelineColumns(kindFilter, showProject);
	const style = { '--diary-grid-columns': diaryTimelineGridColumns(columns) } as CSSProperties;
	return (
		<div className="@container">
			<div
				className={cn(
					'grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-5',
					'@min-[45rem]:grid-cols-(--diary-grid-columns)',
				)}
				style={style}>
				{children}
			</div>
		</div>
	);
}

function DiaryTimelineRow({
	columns,
	item,
}: {
	columns: DiaryTimelineColumns;
	item: DiaryTimelineItem;
}) {
	const parts = metaParts(item);
	const runOutcome = classifyDiaryTimelineRun(item);
	const rawStatusLabel = runOutcome?.label ?? humanizeEnum(item.status);
	const statusLabel = /completed.*(?:warning|work parked)/iu.test(rawStatusLabel)
		? 'Completed · warnings'
		: /^(?:run )?stopped$/iu.test(rawStatusLabel)
			? 'Stopped'
			: rawStatusLabel;
	const statusTone = /^(?:aborted|killed)$/iu.test(statusLabel)
		? 'red'
		: statusLabel === 'Stopped'
			? 'amber'
			: (runOutcome?.tone ?? timelineItemTone(item));
	const href = item.projectPath ? `/runs?project=${encodeURIComponent(item.projectPath)}` : null;
	const detail = item.detail;
	return (
		// Two fixed columns rather than a wrapping flex row: under `justify-between` the stamp sits
		// top-right on short rows and drops to bottom-left whenever the detail block wraps, so the
		// list has no vertical rail to scan.
		//
		// A row that leads somewhere says so at rest and takes the whole row as its target: a
		// title whose colour changes on hover is nothing to a reader who is not already pointing
		// at it. `relative` is what the title's `after:inset-0` overlay
		// resolves against, and the ring is `focus-within` because the focus lands on that overlay.
		<li
			className={cn(
				'relative isolate px-3 py-2',
				'col-span-full grid grid-cols-subgrid items-start',
				href &&
					'transition-colors focus-within:bg-muted/60 focus-within:ring-2 focus-within:ring-ring/80 focus-within:ring-inset hover:bg-muted/60',
			)}>
			{/* The enclosing Card owns the bounded measure, so the columns, hover band, and row rules
			    share one edge while the narrative retains its narrower reading measure. */}
			<div className="flex min-w-0 flex-wrap items-center gap-2 @min-[45rem]:contents">
				{/* No width here any more. A fixed-width cell around an inline-flex badge is what
				    produced the overpaint: the span held its 64px and the badge grew straight out
				    of it. The track carries the minimum now, and it carries the maximum too, so
				    the badge cannot leave it. */}
				{columns.kind ? (
					<span className="min-w-0">
						<Badge tone="neutral">
							<DiaryKindIcon kind={item.kind} />
							{timelineKindLabel(item.kind)}
						</Badge>
					</span>
				) : null}
				{columns.status ? (
					<span
						className={cn(
							'min-w-0',
							item.kind === 'release' && 'hidden @min-[45rem]:block',
						)}>
						{/* A release has no lifecycle — its status is the literal string "completed" on
					    every row — so the badge was a second pill repeating the first. */}
						{item.kind === 'release' ? null : (
							<Badge title={runOutcome?.title} tone={statusTone}>
								{statusLabel}
							</Badge>
						)}
					</span>
				) : null}
				{columns.project ? (
					item.projectName ? (
						<span
							className="w-full min-w-0 truncate text-xs text-muted-foreground @min-[45rem]:w-auto"
							title={item.projectName}>
							{item.projectName}
						</span>
					) : (
						<span aria-hidden="true" className="hidden @min-[45rem]:block" />
					)
				) : null}
				<div className="min-w-0 flex-1 basis-48 @min-[45rem]:basis-auto">
					<div className="flex flex-wrap items-center gap-2">
						{href ? (
							<Link
								aria-label={rowLinkLabel(item, columns.project)}
								// The accent, not an underline the reader cannot see. `decoration-border`
								// is 1.23:1 against the row, so of the 70 rows in this feed the 36 that
								// navigate and the 34 that do not were indistinguishable at rest — and
								// filtering to Releases showed 20 inert rows painted exactly like the run
								// rows above them. This is the treatment the Dashboard's feature rows and
								// the entry cards on this same page already use for a linked title; the
								// underline arrives on hover, where it costs no layout.
								className="font-medium text-accent underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:outline-none"
								to={href}>
								{displayedTitle(item, columns.project)}
							</Link>
						) : (
							<span className="font-medium text-foreground">
								{displayedTitle(item, columns.project)}
							</span>
						)}
						{/* Inline with the title rather than on a line of its own: a release row spent two
					    lines of height to carry the single word "aidd". The parts are divided by a
					    rendered separator, because an 8px gap between three muted spans left the
					    reader to guess where "aidd" ended and "coding" began. */}
						{parts.map((part, index) => (
							<span
								className="flex items-center gap-2 text-xs text-muted-foreground"
								key={`${item.id}-meta-${index}`}>
								{/* `text-muted-foreground`, the weight of the values it divides.
							    At `text-border` the glyph measured 1.23:1 and did not render:
							    the row read as three gap-separated spans, which is the exact
							    ambiguity the separator was added to remove. `text-border` is a
							    stroke colour — its only other use is an SVG edge in the
							    dependency graph. */}
								<span aria-hidden="true" className="text-muted-foreground">
									·
								</span>
								<span className={part.className}>{part.text}</span>
							</span>
						))}
					</div>
					{detail ? <DiaryTimelineDetail detail={detail} itemId={item.id} /> : null}
				</div>
			</div>
			{/* The day heading establishes the date, so the stamp carries the intra-day ordering the
			    relative age ("3d ago" on nine consecutive rows) could not, and puts the exact value
			    in the DOM rather than in a `title` no keyboard user can reach. A date-only record
			    draws none: see `isDateOnly`. */}
			{isDateOnly(item) ? null : (
				<time
					className="relative z-10 shrink-0 text-xs text-muted-foreground tabular-nums"
					dateTime={isoFromMs(item.startedAt)}
					title={formatDate(item.startedAt)}>
					{formatTimeOfDay(item.startedAt)}
				</time>
			)}
		</li>
	);
}

export function DiaryTimelineList({
	initiallyVisible,
	items,
	kindFilter = 'all',
	scopeLabel,
	showProject = false,
}: {
	initiallyVisible?: number;
	items: DiaryTimelineItem[];
	kindFilter?: DiaryKindFilter;
	scopeLabel?: string;
	showProject?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const listId = useId();
	const columns = diaryTimelineColumns(kindFilter, showProject);
	if (items.length === 0) return null;
	const visibleLimit =
		typeof initiallyVisible === 'number' && initiallyVisible > 0
			? initiallyVisible
			: items.length;
	const hasDisclosure = items.length > visibleLimit;
	const visibleItems = hasDisclosure && !expanded ? items.slice(0, visibleLimit) : items;
	return (
		// One raised card per day with hairline separators — the primitive Runs already uses —
		// instead of 40+ individually outlined rows floating on the canvas.
		<Card className="col-span-full grid grid-cols-subgrid gap-x-2 overflow-hidden p-0">
			{/* The feed owns one grid across every day. Each card and list passes those tracks down,
			    so `max-content` resolves once for the corpus instead of once per day. */}
			<ul
				className="col-span-full grid grid-cols-subgrid gap-x-2 divide-y divide-border text-sm"
				id={listId}>
				{visibleItems.map((item) => (
					<DiaryTimelineRow columns={columns} item={item} key={item.id} />
				))}
			</ul>
			{hasDisclosure ? (
				<div className="col-span-full flex justify-center border-t border-border px-3 py-2">
					<Button
						aria-controls={listId}
						aria-expanded={expanded}
						onClick={() => setExpanded((current) => !current)}
						variant="ghost">
						<DisclosureMarker open={expanded} />
						{expanded
							? `Show fewer${scopeLabel ? ` from ${scopeLabel}` : ' activities'}`
							: `Show ${items.length - visibleLimit} more${scopeLabel ? ` from ${scopeLabel}` : ' activities'}`}
					</Button>
				</div>
			) : null}
		</Card>
	);
}
