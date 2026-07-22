import { Link } from 'react-router-dom';

import type { DiaryTimelineItem } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { formatDate, formatDuration, formatRelativeAge } from '../../lib/formatters.ts';
import { timelineItemTone, timelineKindLabel, timelineKindTone } from './diaryItems.ts';

function isoFromMs(ms: number): string {
	return new Date(ms).toISOString();
}

function detailParts(item: DiaryTimelineItem, showProject: boolean): string[] {
	const parts: string[] = [];
	if (showProject && item.projectName) parts.push(item.projectName);
	if (item.mode) parts.push(item.mode);
	if (item.durationMs) parts.push(formatDuration(item.durationMs));
	if (item.detail) parts.push(item.detail);
	return parts;
}

function DiaryTimelineRow({
	item,
	showProject,
}: {
	item: DiaryTimelineItem;
	showProject: boolean;
}) {
	const parts = detailParts(item, showProject);
	return (
		<li className="rounded-md border border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<Badge tone={timelineKindTone(item.kind)}>
							{timelineKindLabel(item.kind)}
						</Badge>
						<Badge tone={timelineItemTone(item)}>{item.status}</Badge>
						{item.projectPath ? (
							<Link
								className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
								to={`/runs?project=${encodeURIComponent(item.projectPath)}`}>
								{item.title}
							</Link>
						) : (
							<span className="font-medium text-neutral-900 dark:text-neutral-100">
								{item.title}
							</span>
						)}
					</div>
					{parts.length > 0 ? (
						<div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-neutral-500">
							{parts.map((part, index) => (
								<span key={`${item.id}-detail-${index}`}>{part}</span>
							))}
						</div>
					) : null}
				</div>
				<span
					className="shrink-0 text-xs text-neutral-500"
					title={formatDate(item.startedAt)}>
					{formatRelativeAge(isoFromMs(item.startedAt))}
				</span>
			</div>
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
		<ul className="space-y-1.5 text-sm">
			{items.map((item) => (
				<DiaryTimelineRow item={item} key={item.id} showProject={showProject} />
			))}
		</ul>
	);
}
