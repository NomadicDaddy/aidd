import type {
	DiaryEntry,
	GitCommitRef,
	ProjectFeature,
	ProjectLocalIteration,
	ProjectLocalRun,
} from '../../../api/types.ts';
import type { ExecutionIdentity } from '../../../lib/executionIdentity.ts';

import { humanizeEnum } from '../../../lib/formatters.ts';
import {
	featureDirectory,
	featureSourceLabel,
	type SourceCategory,
	sourceLabelCategory,
} from './featuresUtils.ts';
import { featureAddedAt, featureCompletedAt } from './featureTimestamps.ts';
import { recentMetadataActivity } from './recentActivityItems.ts';
import { runStatusTone } from './shared.ts';

export type HistoryEventKind = 'audit' | 'diary' | 'feature' | 'remediation' | 'run';

export type HistoryFilter = 'all' | HistoryEventKind;

export const HISTORY_FILTERS: readonly HistoryFilter[] = [
	'all',
	'feature',
	'remediation',
	'audit',
	'run',
	'diary',
];

export const historyFilterLabels: Record<HistoryFilter, string> = {
	all: 'All',
	audit: 'Audit findings',
	diary: 'Diary',
	feature: 'Features',
	remediation: 'Remediations',
	run: 'Runs',
};

export interface HistoryEvent {
	badge: string;
	badgeTone: 'amber' | 'emerald' | 'neutral' | 'red' | 'teal';
	commits: GitCommitRef[];
	duration: null | string;
	executionIdentity: ExecutionIdentity | null;
	featureDirectory: null | string;
	id: string;
	kind: HistoryEventKind;
	runId: null | string;
	sourceLabel: null | string;
	timestamp: string;
	timeValue: number;
	title: string;
	/** The run or iteration this row traces to. Empty for feature lifecycle events. */
	traceLabel: string;
}

export interface HistoryDayGroup {
	events: HistoryEvent[];
	key: string;
	label: string;
}

export const historyKindLabels: Record<HistoryEventKind, string> = {
	audit: 'Audit finding',
	diary: 'Diary',
	feature: 'Feature',
	remediation: 'Remediation',
	run: 'Run',
};

export const historyKindTones: Record<HistoryEventKind, 'amber' | 'neutral' | 'red' | 'teal'> = {
	audit: 'red',
	// Neutral, like the kind badge on the Diary page's own timeline: a narrative entry asserts no
	// status, and the row's second badge already carries whatever the entry does say.
	diary: 'neutral',
	feature: 'teal',
	remediation: 'amber',
	run: 'neutral',
};

function featureEventTitle(feature: ProjectFeature): string {
	return feature.title ?? featureDirectory(feature);
}

function createdEvent(feature: ProjectFeature, kind: SourceCategory) {
	const created = featureAddedAt(feature);
	if (!created) return null;
	return {
		badge: 'Created',
		badgeTone: 'teal' as const,
		commits: [],
		duration: null,
		executionIdentity: null,
		featureDirectory: featureDirectory(feature),
		id: `feature-created:${featureDirectory(feature)}`,
		kind,
		runId: null,
		sourceLabel: null,
		timestamp: created.iso,
		timeValue: created.timeValue,
		title: featureEventTitle(feature),
		traceLabel: '',
	};
}

function completedEvent(feature: ProjectFeature, kind: SourceCategory) {
	const completed = featureCompletedAt(feature);
	if (!completed) return null;
	return {
		badge: 'Completed',
		badgeTone: 'emerald' as const,
		commits: [],
		duration: null,
		executionIdentity: null,
		featureDirectory: featureDirectory(feature),
		id: `feature-completed:${featureDirectory(feature)}`,
		kind,
		runId: null,
		sourceLabel: null,
		timestamp: completed.iso,
		timeValue: completed.timeValue,
		title: featureEventTitle(feature),
		traceLabel: '',
	};
}

function featureEvents(features: ProjectFeature[]): HistoryEvent[] {
	const events: HistoryEvent[] = [];
	for (const feature of features) {
		const kind = sourceLabelCategory(featureSourceLabel(feature));
		const created = createdEvent(feature, kind);
		if (created) events.push(created);
		const completed = completedEvent(feature, kind);
		if (completed) events.push(completed);
	}
	return events;
}

function runEvents(
	localRuns: ProjectLocalRun[],
	localIterations: ProjectLocalIteration[],
): HistoryEvent[] {
	// `traceLabel` is its own field rather than the last of `detailParts`: it is a machine id and
	// the row sets it mono, which a flat string list cannot express.
	return recentMetadataActivity(localRuns, localIterations).map((item) => ({
		badge: humanizeEnum(item.statusLabel),
		badgeTone: runStatusTone(item.status),
		commits: item.commits,
		duration: item.duration,
		executionIdentity: item.executionIdentity,
		featureDirectory: null,
		id: item.id,
		kind: 'run' as const,
		runId: item.runId,
		sourceLabel: item.sourceLabel,
		timestamp: item.timestamp,
		timeValue: item.timeValue,
		title: item.title,
		traceLabel: item.traceLabel,
	}));
}

/**
 * Diary entries as timeline rows, ordered by file mtime rather than by `date`.
 *
 * `date` is the calendar day the entry is about and has no time of day, so ordering on it would
 * pin every entry to midnight and bury it under that day's runs. `fileMtimeMs` is when the entry
 * was actually written, which is what places it among the events it narrates.
 */
function diaryEvents(entries: DiaryEntry[]): HistoryEvent[] {
	return entries.map((entry) => ({
		badge: entry.phase ?? 'Entry',
		badgeTone: 'neutral' as const,
		commits: [],
		duration: null,
		executionIdentity: null,
		featureDirectory: null,
		id: `diary:${entry.id}`,
		kind: 'diary' as const,
		runId: null,
		sourceLabel: entry.summary,
		timestamp: new Date(entry.fileMtimeMs).toISOString(),
		timeValue: entry.fileMtimeMs,
		title: entry.title,
		traceLabel: '',
	}));
}

export function buildHistoryEvents(
	features: ProjectFeature[],
	localRuns: ProjectLocalRun[],
	localIterations: ProjectLocalIteration[],
	diaryEntries: DiaryEntry[] = [],
): HistoryEvent[] {
	return [
		...featureEvents(features),
		...runEvents(localRuns, localIterations),
		...diaryEvents(diaryEntries),
	].sort((left, right) => right.timeValue - left.timeValue);
}

export function filterHistoryEvents(events: HistoryEvent[], filter: HistoryFilter): HistoryEvent[] {
	if (filter === 'all') return events;
	return events.filter((event) => event.kind === filter);
}

export function historyFilterCounts(events: HistoryEvent[]): Record<HistoryFilter, number> {
	const counts: Record<HistoryFilter, number> = {
		all: events.length,
		audit: 0,
		diary: 0,
		feature: 0,
		remediation: 0,
		run: 0,
	};
	for (const event of events) counts[event.kind]++;
	return counts;
}

function dayKey(timeValue: number): string {
	const date = new Date(timeValue);
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

export function groupHistoryEventsByDay(events: HistoryEvent[]): HistoryDayGroup[] {
	const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
	const groups: HistoryDayGroup[] = [];
	for (const event of events) {
		const key = dayKey(event.timeValue);
		const current = groups.at(-1);
		if (current && current.key === key) {
			current.events.push(event);
			continue;
		}
		groups.push({ events: [event], key, label: formatter.format(event.timeValue) });
	}
	return groups;
}
