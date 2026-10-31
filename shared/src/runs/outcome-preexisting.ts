import type { WebRunOutcome } from './outcome.ts';

// Marker the orchestrator embeds when a path that was already uncommitted at run start changed
// during the run (pre-existing-paths.ts). A shared tree means it may be a teammate's save, so the
// outcome asks for a look and blames nobody.
export const preExistingChangedMarker = 'preexisting_paths_changed:';

export const completedWithPreExistingChange: WebRunOutcome = {
	label: 'Completed · existing work changed',
	title: 'Files that were already uncommitted when the run started changed during it, by this run or by someone else. Check them with their owner before accepting the run.',
	tone: 'amber',
};
