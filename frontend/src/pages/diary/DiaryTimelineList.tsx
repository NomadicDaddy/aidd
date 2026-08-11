import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';

import type { DiaryTimelineItem } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { formatDate, formatDuration, formatTimeOfDay } from '../../lib/formatters.ts';
import { timelineItemTone, timelineKindLabel } from './diaryItems.ts';

function isoFromMs(ms: number): string {
	return new Date(ms).toISOString();
}

/**
 * A release is parsed out of a `## [YYYY-MM-DD]` CHANGELOG heading and carries no clock at all — its
 * `startedAt` is local midnight only because a date had to become a number to sort with the rest of
 * the feed. Printing that back gave all thirteen release rows the stamp "12:00 AM", a time nobody
 * recorded, so the record's own precision decides whether a stamp is drawn.
 */
function isDateOnly(item: DiaryTimelineItem): boolean {
	return item.kind === 'release';
}

interface MetaPart {
	className: string;
	text: string;
}

/**
 * The structured facts that sit beside the title. `item.detail` is deliberately absent: it is
 * agent-written prose and is rendered separately below, because as a chip it ran to the full row
 * width in the same `text-xs` as "coding" and "198m 31s".
 *
 * A run's title is `${mode} · ${projectName}`, so both facts used to be printed twice in the same
 * row — the title read "coding · aidd" and the line directly under it read "aidd coding 170m 58s".
 * A part the title already states is dropped rather than restated. The comparison is against whole
 * ` · `-joined segments, not a substring: a skill titled "Coding run" mentions the word without the
 * title being the mode, and dropping the chip there would lose a fact rather than a repetition.
 */
function metaParts(item: DiaryTimelineItem, showProject: boolean): MetaPart[] {
	const segments = new Set(item.title.toLowerCase().split(' · '));
	const stated = (value: string): boolean => segments.has(value.toLowerCase());
	const parts: MetaPart[] = [];
	// A project name is a directory: it is the one value in the row a reader compares character by
	// character against a path somewhere else, so it is set in mono like every other identifier.
	if (showProject && item.projectName && !stated(item.projectName)) {
		parts.push({ className: 'font-mono', text: item.projectName });
	}
	if (item.mode && !stated(item.mode)) parts.push({ className: '', text: item.mode });
	if (item.durationMs) {
		parts.push({ className: 'tabular-nums', text: formatDuration(item.durationMs) });
	}
	return parts;
}

/**
 * The title, with any project segment set in the face a project is set in everywhere else.
 *
 * A run's title arrives composed as `${mode} · ${projectName}`, and `metaParts` drops the mono chip
 * for a value the title already states. That left the same identifier in two faces in vertically
 * adjacent rows: the run row read "directive · podex" in Geist Sans and the recipe row directly
 * under it printed "podex" as a Geist Mono chip. The dedupe is right — the fact is stated once — so
 * the fix is that the one place it is stated sets it as the machine string it is.
 *
 * Whole ` · ` segments are compared, never substrings, for the same reason `metaParts` does: a
 * skill titled "Coding run" mentions a mode without being one.
 */
function renderTitle(item: DiaryTimelineItem): ReactNode {
	const project = item.projectName?.toLowerCase();
	const segments = item.title.split(' · ');
	if (!project || !segments.some((segment) => segment.toLowerCase() === project)) {
		return item.title;
	}
	return segments.map((segment, index) => (
		<Fragment key={index}>
			{index > 0 ? ' · ' : null}
			<span className={segment.toLowerCase() === project ? 'font-mono' : undefined}>
				{segment}
			</span>
		</Fragment>
	));
}

/**
 * The link's accessible name.
 *
 * Every run row in a project links to the same filtered Runs view under the same visible text, so a
 * screen reader's link list held nine entries reading "coding · aidd" and no way to tell them apart.
 * The visible title leads — the name has to contain the label a speech user would say — and the
 * stamp that already distinguishes the rows visually follows it.
 */
function rowLinkLabel(item: DiaryTimelineItem): string {
	return `${item.title} · ${timelineKindLabel(item.kind)} · ${formatDate(item.startedAt)}`;
}

function DiaryTimelineRow({
	item,
	showProject,
}: {
	item: DiaryTimelineItem;
	showProject: boolean;
}) {
	const parts = metaParts(item, showProject);
	const href = item.projectPath ? `/runs?project=${encodeURIComponent(item.projectPath)}` : null;
	return (
		// Two fixed columns rather than a wrapping flex row: under `justify-between` the stamp sat
		// top-right on short rows and dropped to bottom-left whenever the detail block wrapped, so
		// the list had no vertical rail to scan.
		//
		// A row that leads somewhere says so at rest and takes the whole row as its target: the only
		// affordance used to be the title's colour changing on hover, which is nothing to a reader
		// who is not already pointing at it. `relative` is what the title's `after:inset-0` overlay
		// resolves against, and the ring is `focus-within` because the focus lands on that overlay.
		<li
			className={cn(
				'relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-3 py-2',
				href &&
					'transition-colors focus-within:bg-muted/60 focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-inset hover:bg-muted/60',
			)}>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<Badge tone="neutral">{timelineKindLabel(item.kind)}</Badge>
					{/* A release has no lifecycle — its status is the literal string "completed" on
					    every row — so the badge was a second pill repeating the first. */}
					{item.kind === 'release' ? null : (
						<Badge tone={timelineItemTone(item)}>{item.status}</Badge>
					)}
					{href ? (
						<Link
							aria-label={rowLinkLabel(item)}
							// The accent, not an underline the reader cannot see. `decoration-border`
							// is 1.23:1 against the row, so of the 70 rows in this feed the 36 that
							// navigate and the 34 that do not were indistinguishable at rest — and
							// filtering to Releases showed 20 inert rows painted exactly like the run
							// rows above them. This is the treatment the Dashboard's feature rows and
							// the entry cards on this same page already use for a linked title; the
							// underline arrives on hover, where it costs no layout.
							className="font-medium text-accent underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:outline-none"
							to={href}>
							{renderTitle(item)}
						</Link>
					) : (
						<span className="font-medium text-foreground">{renderTitle(item)}</span>
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
				{item.detail ? (
					<p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">{item.detail}</p>
				) : null}
			</div>
			{/* The day heading establishes the date, so the stamp carries the intra-day ordering the
			    relative age ("3d ago" on nine consecutive rows) could not, and puts the exact value
			    in the DOM rather than in a `title` no keyboard user can reach. A date-only record
			    draws none: see `isDateOnly`. */}
			{isDateOnly(item) ? null : (
				<time
					className="shrink-0 text-xs text-muted-foreground tabular-nums"
					dateTime={isoFromMs(item.startedAt)}
					title={formatDate(item.startedAt)}>
					{formatTimeOfDay(item.startedAt)}
				</time>
			)}
		</li>
	);
}

export function DiaryTimelineList({
	items,
	showProject = false,
}: {
	items: DiaryTimelineItem[];
	showProject?: boolean;
}) {
	if (items.length === 0) return null;
	return (
		// One raised card per day with hairline separators — the primitive Runs already uses —
		// instead of 40+ individually outlined rows floating on the canvas.
		<Card className="overflow-hidden p-0">
			<ul className="divide-y divide-border text-sm">
				{items.map((item) => (
					<DiaryTimelineRow item={item} key={item.id} showProject={showProject} />
				))}
			</ul>
		</Card>
	);
}
