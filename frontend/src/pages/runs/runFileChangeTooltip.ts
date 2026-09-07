import { fileChangePathLimit } from 'aidd-shared/runs/file-changes';

import type { RunFileChangeSource } from '../../api/types.ts';

export type RunFileChangeKind = 'created' | 'edited';

export interface RunFileChangeTooltipModel {
	countNote: string;
	paths: string[];
	sourceNote: string;
	title: string;
	truncatedNote: null | string;
}

export const fileChangeTelemetryNote =
	'Counts come from Edit/Write tool telemetry and sum per-iteration activity, so a file touched in several iterations counts each time but is listed once; ignored metadata edits may not appear in git status.';

export function fileChangeSourceNote(source: RunFileChangeSource): string {
	if (source === 'ledger') return 'Recorded in run ledger.';
	if (source === 'iteration-artifacts') return 'Recovered from iteration artifacts.';
	return 'Path list not recorded for this run.';
}

export function buildRunFileChangeTooltipModel(input: {
	kind: RunFileChangeKind;
	paths: readonly string[];
	source: RunFileChangeSource;
	truncated: boolean;
}): RunFileChangeTooltipModel {
	return {
		countNote: fileChangeTelemetryNote,
		paths: [...input.paths],
		sourceNote: fileChangeSourceNote(input.source),
		title: input.kind === 'created' ? 'Created files' : 'Edited files',
		truncatedNote: input.truncated ? `Showing first ${fileChangePathLimit} paths.` : null,
	};
}
