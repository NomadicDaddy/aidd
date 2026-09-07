import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { DirectorSuggestionLaunch } from './suggestionService.ts';

import { suggestions } from '../../db/schema.ts';
import { SuggestionClaimLostError } from './suggestionService.ts';

/**
 * What a person's **Launch** achieved, once the possibility of losing a race is accounted for.
 *
 * `claimedElsewhere` is the whole point of the type. Item 5 of the auto-launch spec requires that a
 * manual launch racing the Director's own produce exactly one run AND no operator-visible error,
 * and those are two separate obligations: the atomic claim in `launchSuggestion` satisfies the
 * first on its own, but it satisfies it by throwing at the loser, which is the second obligation
 * broken. A person who clicks Launch a moment after the Director did has not made a mistake and has
 * nothing to fix; the work they asked for is running.
 */
export interface OperatorLaunchOutcome {
	/** True when something else had already claimed it and this click started nothing new. */
	claimedElsewhere: boolean;
	/**
	 * The launch that is actually in flight. Null only in the narrow window where the winner has
	 * claimed the row but not yet written back what it started — the work is running either way.
	 */
	launch: DirectorSuggestionLaunch | null;
}

/**
 * Runs a launch on behalf of a person, absorbing a lost claim into an ordinary outcome.
 *
 * Only a lost claim is absorbed, and only when the row says the suggestion really is in flight. A
 * suggestion dismissed out from under the click throws the original error: reporting that as
 * "already running" would be the reassuring answer rather than the true one, and the operator would
 * go looking for a run that does not exist.
 *
 * @param db Used to read back what the winner started.
 * @param id The suggestion being launched.
 * @param launch The raw launch, which claims the row and throws if it loses.
 * @returns What was started, and whether this caller is the one that started it.
 */
export async function launchSuggestionForOperator(
	db: WebDatabase,
	id: string,
	launch: () => Promise<DirectorSuggestionLaunch>,
): Promise<OperatorLaunchOutcome> {
	try {
		return { claimedElsewhere: false, launch: await launch() };
	} catch (err) {
		if (!(err instanceof SuggestionClaimLostError)) throw err;
		const row = (
			await db
				.select({
					launchedPipelineSessionId: suggestions.launchedPipelineSessionId,
					launchedRunId: suggestions.launchedRunId,
					status: suggestions.status,
				})
				.from(suggestions)
				.where(eq(suggestions.id, id))
		)[0];
		if (!row || (row.status !== 'launched' && row.status !== 'launching')) throw err;
		return { claimedElsewhere: true, launch: inFlightLaunch(row) };
	}
}

function inFlightLaunch(row: {
	launchedPipelineSessionId: null | string;
	launchedRunId: null | string;
}): DirectorSuggestionLaunch | null {
	if (row.launchedRunId) return { kind: 'run', runId: row.launchedRunId };
	if (row.launchedPipelineSessionId) {
		return { kind: 'pipeline', pipelineSessionId: row.launchedPipelineSessionId };
	}
	return null;
}
