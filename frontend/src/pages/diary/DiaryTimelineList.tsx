import { Link } from 'react-router';

import type { DiaryTimelineItem } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { formatDate, formatDuration, formatTimeOfDay } from '../../lib/formatters.ts';
import { timelineItemTone, timelineKindLabel } from './diaryItems.ts';

function isoFromMs(ms: number): string {
	return new Date(ms).toISOString();
}

/**
 * The structured facts that belong in the chip run. `item.detail` is deliberately absent: it is
 * agent-written prose and is rendered separately below, because as a chip it ran to the full row
 * width in the same `text-xs` as "coding" and "198m 31s".
 */
function metaParts(item: DiaryTimelineItem, showProject: boolean): string[] {
	const parts: string[] = [];
	if (showProject && item.projectName) parts.push(item.projectName);
	if (item.mode) parts.push(item.mode);
	if (item.durationMs) parts.push(formatDuration(item.durationMs));
	return parts;
}

function DiaryTimelineRow({
	item,
	showProject,
}: {
	item: DiaryTimelineItem;
	showProject: boolean;
}) {
	const parts = metaParts(item, showProject);
	return (
		// Two fixed columns rather than a wrapping flex row: under `justify-between` the stamp sat
		// top-right on short rows and dropped to bottom-left whenever the detail block wrapped, so
		// the list had no vertical rail to scan.
		<li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-3 py-2">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<Badge tone="neutral">{timelineKindLabel(item.kind)}</Badge>
					{/* A release has no lifecycle — its status is the literal string "completed" on
					    every row — so the badge was a second pill repeating the first. */}
					{item.kind === 'release' ? null : (
						<Badge tone={timelineItemTone(item)}>{item.status}</Badge>
					)}
					{item.projectPath ? (
						<Link
							className="font-medium text-foreground hover:underline"
							to={`/runs?project=${encodeURIComponent(item.projectPath)}`}>
							{item.title}
						</Link>
					) : (
						<span className="font-medium text-foreground">{item.title}</span>
					)}
				</div>
				{parts.length > 0 ? (
					<div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
						{parts.map((part, index) => (
							<span key={`${item.id}-meta-${index}`}>{part}</span>
						))}
					</div>
				) : null}
				{item.detail ? (
					<p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">{item.detail}</p>
				) : null}
			</div>
			{/* The day heading establishes the date, so the stamp carries the intra-day ordering the
			    relative age ("3d ago" on nine consecutive rows) could not, and puts the exact value
			    in the DOM rather than in a `title` no keyboard user can reach. */}
			<time
				className="shrink-0 text-xs text-muted-foreground tabular-nums"
				dateTime={isoFromMs(item.startedAt)}
				title={formatDate(item.startedAt)}>
				{formatTimeOfDay(item.startedAt)}
			</time>
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
