import type { WebRunOutcome } from './outcome.ts';

// Marker the orchestrator embeds when a path that was already uncommitted at run start changed
// during the run (pre-existing-paths.ts). A shared tree means it may be a teammate's save, so the
// outcome asks for a look and blames nobody.
export const preExistingChangedMarker = 'preexisting_paths_changed:';

// A commit skill staged or committed such a path. Its task may have delegated that, and nothing
// recorded can say, so the outcome stays visible without implying harm.
export const preExistingCommittedMarker = 'preexisting_paths_committed:';

export function hasPreExistingChangeMarker(summary: null | string | undefined): boolean {
	return (summary ?? '').includes(preExistingChangedMarker);
}

export function hasPreExistingCommitMarker(summary: null | string | undefined): boolean {
	return (summary ?? '').includes(preExistingCommittedMarker);
}

export const completedWithPreExistingCommit: WebRunOutcome = {
	label: 'Completed · existing work committed',
	title: 'This commit run staged or committed files that were already uncommitted when it started. Its task may have delegated them; aidd cannot verify that, so confirm they were in scope.',
	tone: 'neutral',
};

export const completedWithPreExistingChange: WebRunOutcome = {
	label: 'Completed · existing work changed',
	title: 'Files that were already uncommitted when the run started changed during it, by this run or by someone else. Check them with their owner before accepting the run.',
	tone: 'amber',
};
