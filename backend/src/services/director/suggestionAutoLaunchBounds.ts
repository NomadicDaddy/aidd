import type {
	DirectorAutoLaunchSkipCode,
	DirectorAutoLaunchSkipped,
	DirectorRiskLevel,
} from 'aidd-shared';
import type { ResolvedDirectorSuggestionsAutoLaunchConfig } from 'aidd-shared/config/types';

import { directorRiskLevels } from 'aidd-shared';

/**
 * The bounds that decide whether the Director may start one of its own suggestions.
 *
 * Kept apart from the launching in `suggestionAutoLaunch.ts` for one reason: these rules must be
 * readable and testable without a database or project tree. The safety rules are evaluated before
 * any launch so enabling the feature cannot turn an ineligible suggestion into unattended work.
 *
 * Every rule here is a refusal. Nothing in this file can cause work to start; it can only stop it.
 */

/** The suggestion facts the bounds read. A structural subset of the persisted row. */
export interface AutoLaunchCandidate {
	id: string;
	projectId: null | string;
	rank: null | number;
	riskLevel: string;
	suggestedRecipe: null | string;
	title: string;
}

/** What the caller must find out about a project before a candidate targeting it can proceed. */
export interface AutoLaunchProjectFacts {
	/** Files dirty in the working tree, or null when the tree could not be read at all. */
	dirtyFileCount: null | number;
	/** True when a run is in flight OR a pipeline session is between steps. Either means busy. */
	hasActiveWork: boolean;
	/** Absolute path, or null when no registered project answers to the suggestion's identity. */
	path: null | string;
}

function skip(
	candidate: AutoLaunchCandidate,
	code: DirectorAutoLaunchSkipCode,
	reason: string,
): DirectorAutoLaunchSkipped {
	return { code, reason, suggestionId: candidate.id, title: candidate.title };
}

// directorRiskLevels is ordered LOW, MEDIUM, HIGH, so position is severity. An unrecognised value
// sorts above every ceiling rather than below it: a risk level this build does not know about is
// the one thing that must not slip under a bound by default.
function riskRank(level: string): number {
	const index = directorRiskLevels.indexOf(level as DirectorRiskLevel);
	return index === -1 ? directorRiskLevels.length : index;
}

/**
 * The rules that need nothing but the suggestion itself and the configured bounds.
 *
 * Run first so a candidate that fails here never costs a `git status` or a project listing.
 *
 * @param candidate The suggestion being considered.
 * @param config The bounds in force.
 * @returns The refusal, or null when this suggestion clears every intrinsic bound.
 */
export function intrinsicRefusal(
	candidate: AutoLaunchCandidate,
	config: ResolvedDirectorSuggestionsAutoLaunchConfig,
): DirectorAutoLaunchSkipped | null {
	// A recipe-backed suggestion starts a pipeline session rather than a single run: several steps,
	// remediation of its own, and as many runs as the recipe has stages. Every other bound in this
	// file is written against one run in one project and none of them can express that difference,
	// so the allow-list is where it is held.
	//
	// It is an allow-list rather than a block-list on purpose. The recipes prioritized work names
	// differ by an order of magnitude in what they set off — `coding` is four flat steps against one
	// named feature, `project-intake` is nine steps wrapping five nested recipes — and refusing on
	// absence is also what makes a recipe name the model invented safe without a lookup: it simply
	// is not in the list. The bound this replaced refused every recipe, which read as a narrow
	// exception and was in fact the whole population: 3,152 of 3,161 real suggestions name one.
	if (candidate.suggestedRecipe && !config.allowedRecipes.includes(candidate.suggestedRecipe)) {
		return skip(
			candidate,
			'recipe_backed',
			`Recipe ${candidate.suggestedRecipe} is not one the Director may start on its own; ` +
				'a person launches this one.',
		);
	}
	if (candidate.projectId === null) {
		return skip(
			candidate,
			'project_unavailable',
			'Fleet-wide suggestions name no project to run in.',
		);
	}
	// Unranked and below-cutoff are one bound, deliberately. Both mean "this is not the piece of
	// work this cycle put first", and a rollup or a model-authored suggestion with no
	// prioritized-work ancestor stores NULL precisely so it can never be picked automatically.
	if (candidate.rank === null) {
		return skip(
			candidate,
			'rank_ineligible',
			'No rank: a rollup or a suggestion with no prioritized-work ancestor is never ' +
				'launched automatically.',
		);
	}
	if (candidate.rank > config.maxRank) {
		return skip(
			candidate,
			'rank_ineligible',
			`Rank ${candidate.rank} is below the cutoff of ${config.maxRank}.`,
		);
	}
	if (riskRank(candidate.riskLevel) > riskRank(config.riskCeiling)) {
		return skip(
			candidate,
			'risk_above_ceiling',
			`Risk ${candidate.riskLevel} is above the ceiling of ${config.riskCeiling}.`,
		);
	}
	return null;
}

/**
 * The rules that need the state of the project the suggestion targets.
 *
 * @param candidate The suggestion being considered.
 * @param facts What was found out about its project.
 * @param dirtyTreeThreshold The install-wide dirty-file ceiling runs already honour.
 * @returns The refusal, or null when the project is in a fit state to be worked on.
 */
export function projectRefusal(
	candidate: AutoLaunchCandidate,
	facts: AutoLaunchProjectFacts,
	dirtyTreeThreshold: number,
): DirectorAutoLaunchSkipped | null {
	if (facts.path === null) {
		// Also how an older suggestion carrying a bare folder name is refused once a second
		// checkout takes that name: the identity index holds `sample~a1b2` and `sample~c3d4`, and
		// nothing at all under `sample`. Refusing beats guessing which of the two it meant.
		return skip(
			candidate,
			'project_unavailable',
			`No registered project answers to ${candidate.projectId ?? 'unknown'}.`,
		);
	}
	if (facts.hasActiveWork) {
		return skip(
			candidate,
			'active_run',
			'That project is already busy: a run is in flight, or a pipeline session is between ' +
				'its steps.',
		);
	}
	// A tree that cannot be read is not a clean tree. Refusing is the conservative reading, and the
	// operator sees which project could not be inspected rather than a run that starts on top of
	// unknown local state.
	if (facts.dirtyFileCount === null) {
		return skip(
			candidate,
			'project_unavailable',
			'The working tree could not be read, so nothing is known about local changes.',
		);
	}
	// Same comparison the orchestrator's own preflight makes, so a suggestion is never launched
	// into a run that would immediately refuse itself for the same reason.
	if (facts.dirtyFileCount > dirtyTreeThreshold) {
		return skip(
			candidate,
			'dirty_tree',
			`Working tree has ${facts.dirtyFileCount} dirty files, over the threshold of ` +
				`${dirtyTreeThreshold}.`,
		);
	}
	return null;
}

/**
 * One suggestion per project per cycle.
 *
 * `projectRefusal` asks whether a project already has a run in flight, and that answer is read once,
 * before this cycle has started anything. It cannot see the runs this same scan is about to start.
 * Two suggestions naming one repository would both clear it and both launch, putting two agents in
 * one working tree — precisely what the active-run bound exists to prevent.
 *
 * Applied when a candidate becomes eligible rather than when it launches, so the eligible list holds
 * at most one candidate per project. That is what makes the launch loop unable to breach the bound
 * however its quota arithmetic works out, rather than relying on the loop to remember.
 *
 * @param candidate The suggestion being considered.
 * @param claimed Projects an earlier, higher-ranked candidate in this cycle has already taken.
 * @returns The refusal, or null when nothing this cycle has claimed the project yet.
 */
export function siblingRefusal(
	candidate: AutoLaunchCandidate,
	claimed: ReadonlySet<string>,
): DirectorAutoLaunchSkipped | null {
	if (candidate.projectId === null || !claimed.has(candidate.projectId)) return null;
	// Reported under the active-run code on purpose: the reason an operator needs is the same one —
	// that project is spoken for — and the sentence says which of the two ways it is spoken for.
	return skip(
		candidate,
		'active_run',
		'A higher-ranked suggestion this cycle is already taking that project.',
	);
}

/**
 * The per-cycle ceiling, applied to a candidate that has already cleared every other bound.
 *
 * `taken` is deliberately not "how many candidates have been considered". The launch loop passes the
 * number of suggestions that actually started, so a candidate whose claim was lost between the scan
 * and the launch gives its place back to the next one in rank order instead of the cycle recording
 * a limit it never reached.
 *
 * @param candidate The suggestion being considered.
 * @param taken How many of this cycle's places are already spoken for.
 * @param maxPerCycle The ceiling in force.
 * @returns The refusal, or null when there is still room this cycle.
 */
export function quotaRefusal(
	candidate: AutoLaunchCandidate,
	taken: number,
	maxPerCycle: number,
): DirectorAutoLaunchSkipped | null {
	if (taken < maxPerCycle) return null;
	return skip(
		candidate,
		'max_per_cycle',
		`This cycle's ceiling of ${maxPerCycle} is already taken by higher-ranked suggestions.`,
	);
}
