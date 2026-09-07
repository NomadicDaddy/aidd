import type { DiaryTimelineItem } from '../../api/types.ts';

import { formatDate, formatDuration } from '../../lib/formatters.ts';
import { timelineKindLabel } from './diaryItems.ts';

/**
 * How a timeline row derives the text it prints.
 *
 * These are the decisions about what a row says — which facts the title already states, whether the
 * record has a clock to show, what a screen reader hears. They moved out of the component so the
 * list file is about layout: the column template, the subgrid rows, and the disclosure.
 */
export function isoFromMs(ms: number): string {
	return new Date(ms).toISOString();
}

/**
 * A release is parsed out of a `## [YYYY-MM-DD]` CHANGELOG heading and carries no clock at all — its
 * `startedAt` is local midnight only because a date had to become a number to sort with the rest of
 * the feed. Printing that back gave all thirteen release rows the stamp "12:00 AM", a time nobody
 * recorded, so the record's own precision decides whether a stamp is drawn.
 */
export function isDateOnly(item: DiaryTimelineItem): boolean {
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
 * A run's title is `${mode} · ${projectName}`, so restating both facts here would print them twice
 * in the same row — a title reading "coding · aidd" over a line reading "aidd coding 170m 58s".
 * A part the title already states is dropped rather than restated. The comparison is against whole
 * ` · `-joined segments, not a substring: a skill titled "Coding run" mentions the word without the
 * title being the mode, and dropping the chip there would lose a fact rather than a repetition.
 */
export function metaParts(item: DiaryTimelineItem): MetaPart[] {
	const segments = new Set(item.title.toLowerCase().split(' · '));
	const stated = (value: string): boolean => segments.has(value.toLowerCase());
	const parts: MetaPart[] = [];
	if (item.mode && !stated(item.mode)) parts.push({ className: '', text: item.mode });
	if (item.durationMs) {
		parts.push({ className: 'tabular-nums', text: formatDuration(item.durationMs) });
	}
	return parts;
}

export function displayedTitle(item: DiaryTimelineItem, showProject: boolean): string {
	if (!showProject) return item.title;
	const project = item.projectName?.toLowerCase();
	const segments = item.title.split(' · ');
	if (!project) return item.title;
	const withoutProject = segments.filter((segment) => segment.toLowerCase() !== project);
	return withoutProject.length > 0 ? withoutProject.join(' · ') : item.title;
}

/**
 * The link's accessible name.
 *
 * Every run row in a project links to the same filtered Runs view under the same visible text, so a
 * screen reader's link list held nine entries reading "coding · aidd" and no way to tell them apart.
 * The visible title leads — the name has to contain the label a speech user would say — and the
 * stamp that already distinguishes the rows visually follows it.
 */
export function rowLinkLabel(item: DiaryTimelineItem, showProject: boolean): string {
	const project = showProject && item.projectName ? ` · ${item.projectName}` : '';
	return `${displayedTitle(item, showProject)}${project} · ${timelineKindLabel(item.kind)} · ${formatDate(item.startedAt)}`;
}
