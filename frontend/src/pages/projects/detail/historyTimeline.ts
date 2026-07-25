import type {
	GitCommitRef,
	ProjectFeature,
	ProjectLocalIteration,
	ProjectLocalRun,
} from '../../../api/types.ts';
import type { ExecutionIdentity } from '../../../lib/executionIdentity.ts';

import { featureDirectory, featureSourceLabel, sourceLabelCategory } from './featuresUtils.ts';
import { recentMetadataActivity } from './recentActivityItems.ts';
import { runStatusTone } from './shared.ts';

export type HistoryEventKind = 'audit' | 'feature' | 'remediation' | 'run';

export type HistoryFilter = 'all' | HistoryEventKind;

export const HISTORY_FILTERS: readonly HistoryFilter[] = [
	'all',
	'feature',
	'remediation',
	'audit',
	'run',
];

export const historyFilterLabels: Record<HistoryFilter, string> = {
	all: 'All',
	audit: 'Audit findings',
	feature: 'Features',
	remediation: 'Remediations',
	run: 'Runs',
};

export interface HistoryEvent {
	badge: string;
	badgeTone: 'amber' | 'emerald' | 'neutral' | 'red' | 'teal';
	commits: GitCommitRef[];
	detailParts: string[];
	executionIdentity: ExecutionIdentity | null;
	featureDirectory: null | string;
	id: string;
	kind: HistoryEventKind;
	timestamp: string;
	timeValue: number;
	title: string;
}

export interface HistoryDayGroup {
	events: HistoryEvent[];
	key: string;
	label: string;
}

const eventNouns: Record<Exclude<HistoryEventKind, 'run'>, string> = {
	audit: 'Audit finding',
	feature: 'Feature',
	remediation: 'Remediation',
};

function parsedTimestamp(value: unknown): { iso: string; timeValue: number } | null {
	if (typeof value !== 'string' || value.length === 0) return null;
	const timeValue = Date.parse(value);
	if (Number.isNaN(timeValue)) return null;
	return { iso: value, timeValue };
}

function featureEventTitle(feature: ProjectFeature): string {
	return feature.title ?? featureDirectory(feature);
}

function createdEvent(feature: ProjectFeature, kind: Exclude<HistoryEventKind, 'run'>) {
	const created = parsedTimestamp(feature.createdAt);
	if (!created) return null;
	return {
		badge: `${eventNouns[kind].toLowerCase()} created`,
		badgeTone: 'teal' as const,
		commits: [],
		detailParts: [featureSourceLabel(feature)],
		executionIdentity: null,
		featureDirectory: featureDirectory(feature),
		id: `feature-created:${featureDirectory(feature)}`,
		kind,
		timestamp: created.iso,
		timeValue: created.timeValue,
		title: featureEventTitle(feature),
	};
}

function completedEvent(feature: ProjectFeature, kind: Exclude<HistoryEventKind, 'run'>) {
	if (feature.status !== 'completed') return null;
	// The runtime does not record a dedicated completion timestamp; `justFinishedAt` exists
	// only on template-era features, so `updatedAt` (last metadata write) is the fallback.
	const completed = parsedTimestamp(feature.justFinishedAt) ?? parsedTimestamp(feature.updatedAt);
	if (!completed) return null;
	return {
		badge: `${eventNouns[kind].toLowerCase()} completed`,
		badgeTone: 'emerald' as const,
		commits: [],
		detailParts: [featureSourceLabel(feature)],
		executionIdentity: null,
		featureDirectory: featureDirectory(feature),
		id: `feature-completed:${featureDirectory(feature)}`,
		kind,
		timestamp: completed.iso,
		timeValue: completed.timeValue,
		title: featureEventTitle(feature),
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
	localIterations: ProjectLocalIteration[]
): HistoryEvent[] {
	return recentMetadataActivity(localRuns, localIterations).map((item) => ({
		badge: item.status,
		badgeTone: runStatusTone(item.status),
		commits: item.commits,
		detailParts: [...item.detailParts, item.traceLabel],
		executionIdentity: item.executionIdentity,
		featureDirectory: null,
		id: item.id,
		kind: 'run' as const,
		timestamp: item.timestamp,
		timeValue: item.timeValue,
		title: item.title,
	}));
}

export function buildHistoryEvents(
	features: ProjectFeature[],
	localRuns: ProjectLocalRun[],
	localIterations: ProjectLocalIteration[]
): HistoryEvent[] {
	return [...featureEvents(features), ...runEvents(localRuns, localIterations)].sort(
		(left, right) => right.timeValue - left.timeValue
	);
}

export function filterHistoryEvents(events: HistoryEvent[], filter: HistoryFilter): HistoryEvent[] {
	if (filter === 'all') return events;
	return events.filter((event) => event.kind === filter);
}

export function historyFilterCounts(events: HistoryEvent[]): Record<HistoryFilter, number> {
	const counts: Record<HistoryFilter, number> = {
		all: events.length,
		audit: 0,
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
