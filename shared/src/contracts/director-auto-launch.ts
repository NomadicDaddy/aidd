/**
 * The record one Director cycle keeps of the work it started on its own.
 *
 * Its own module because it is read by three tiers that otherwise share nothing: the launcher that
 * decides, the persistence layer that stores it as one JSON document, and the cycle row a person
 * reads afterwards. It is contract, not behaviour, so it lives with the rest of the contracts.
 */

/**
 * Why the auto-launcher passed over a suggestion.
 *
 * Recorded per suggestion rather than summarised so an operator can distinguish a safety bound
 * doing its job from a launch failure that needs attention.
 */
export type DirectorAutoLaunchSkipCode =
	| 'active_run'
	| 'claim_lost'
	| 'dirty_tree'
	| 'launch_failed'
	| 'max_per_cycle'
	| 'project_unavailable'
	| 'rank_ineligible'
	| 'recipe_backed'
	| 'risk_above_ceiling';

/**
 * One thing a cycle started on its own.
 *
 * A union because a suggestion starts either a single run or, when it names a recipe the bounds
 * allow, a whole pipeline session — and an operator follows the two to different pages. `kind` is
 * normalized when the record is read back, so a row that carries no `kind` (which
 * is always a run) narrows correctly.
 */
export type DirectorAutoLaunchLaunched =
	DirectorAutoLaunchLaunchedRun | DirectorAutoLaunchLaunchedSession;

export interface DirectorAutoLaunchLaunchedRun {
	kind: 'run';
	runId: string;
	suggestionId: string;
	title: string;
}

export interface DirectorAutoLaunchLaunchedSession {
	kind: 'pipeline';
	pipelineSessionId: string;
	suggestionId: string;
	title: string;
}

/**
 * Narrows a stored launch record to the union above.
 *
 * A record with no `kind` is a run: only a recipe-backed launch records one. Narrowing on read
 * rather than rewriting the record leaves a cycle's stored JSON exactly as its launcher wrote it,
 * which is the point of keeping the whole record as one document.
 *
 * @param entry One entry of a stored `launched` array, of unknown vintage.
 * @returns The same entry with `kind` set.
 */
export function normalizeLaunched(entry: DirectorAutoLaunchLaunched): DirectorAutoLaunchLaunched {
	return 'pipelineSessionId' in entry
		? { ...entry, kind: 'pipeline' }
		: { ...entry, kind: 'run' };
}

export interface DirectorAutoLaunchSkipped {
	code: DirectorAutoLaunchSkipCode;
	/** Human text naming the bound that stopped it, with the numbers that decided. */
	reason: string;
	suggestionId: string;
	title: string;
}

/**
 * What one cycle's auto-launcher did, and what it declined to do.
 *
 * Absent (null) means the cycle never reached the auto-launcher: it failed, it was a person
 * pressing Run cycle, or auto-launch is switched off. Present with two empty lists means it ran and
 * had nothing pending to consider.
 */
export interface DirectorCycleAutoLaunch {
	/**
	 * Set when the launcher could not finish — the project list, the suggestion query, or a git read
	 * failed outright. Recorded rather than swallowed: an operator who switched auto-launch on and
	 * got nothing must be able to tell a bound doing its job from the launcher never getting to ask.
	 * The cycle itself still stands, and the suggestions stay pending for a person.
	 */
	error?: string;
	launched: DirectorAutoLaunchLaunched[];
	skipped: DirectorAutoLaunchSkipped[];
}
