import type { WebRunOutcomeInput } from 'aidd-shared/runs/outcome';

export type DiaryTimelineKind = 'director-cycle' | 'recipe-session' | 'release' | 'run' | 'skill';

export interface DiaryEntry {
	bodyMd: string;
	date: string;
	/** Epoch-ms mtime of the entry file. Mirrors DiaryEntryDto: `date` has no time of day, so
	 *  this is what orders an entry against same-day runs on the History timeline. */
	fileMtimeMs: number;
	generatedBy: null | string;
	id: string;
	phase: null | string;
	projectId: string;
	projectName: string;
	projectPath: string;
	summary: null | string;
	title: string;
}

export interface DiaryTimelineItem {
	completedAt: null | number;
	detail: null | string;
	durationMs: null | number;
	id: string;
	kind: DiaryTimelineKind;
	mode: null | string;
	projectName: null | string;
	projectPath: null | string;
	runOutcome: null | WebRunOutcomeInput;
	startedAt: number;
	status: string;
	title: string;
}

export interface DiaryEntriesPage {
	entries: DiaryEntry[];
	nextCursor: null | string;
}

export interface DiaryTimelinePage {
	items: DiaryTimelineItem[];
	nextCursor: null | string;
}
