/**
 * How a project that has not reached the coding phase is described before its blueprint exists.
 *
 * The overview card used to render one wording for every such project — an animated spinner and
 * "Blueprint generation is still in progress" — which is a claim about work in flight that nothing
 * checked. A project sitting idle with no spec.md and no run anywhere reported the same thing as a
 * project whose onboarding run was mid-flight. Readiness (what is on disk) and activity (what is
 * executing) are separate questions, so they are answered separately here.
 */

/** The lifecycle of the setup work found for a project, in that work's own vocabulary. */
export type BlueprintSetupLifecycle =
	'failed' | 'queued' | 'running' | 'stopped' | 'waiting_approval';

export interface BlueprintSetupActivity {
	/** Whether this is a run or a pipeline session, for the caller's navigation link. */
	kind: 'pipeline' | 'run';
	/** Sentence-leading noun phrase for the work, e.g. `The coding run`. */
	label: string;
	lifecycle: BlueprintSetupLifecycle;
	/** Run id or pipeline session id, so the card can link to the work it names. */
	reference: null | string;
}

export interface BlueprintSetupContext {
	/** Live execution state for this exact project, or null when nothing relevant is in flight. */
	activity: BlueprintSetupActivity | null;
	/** Onboarding artifacts still absent, as `listMissingOnboardingArtifacts` names them. */
	missingArtifacts: string[];
}

/** The subset of readiness states a pre-coding project can be in. */
export type BlueprintSetupState = 'blocked' | 'preparing' | 'queued' | 'setup_incomplete';

export interface BlueprintSetupVerdict {
	reason: string;
	state: BlueprintSetupState;
}

function formatList(items: readonly string[]): string {
	if (items.length <= 1) return items[0] ?? '';
	const head = items.slice(0, -1).join(', ');
	return `${head} and ${items[items.length - 1]}`;
}

export function describeMissingSetup(missingArtifacts: readonly string[]): string {
	if (missingArtifacts.length === 0) {
		return 'Project setup is incomplete and no setup work is running.';
	}
	const verb = missingArtifacts.length === 1 ? 'is' : 'are';
	return `Project setup is incomplete: ${formatList(missingArtifacts)} ${verb} missing.`;
}

/**
 * The state and reason for a project whose detected phase is `initializer` or `onboarding`.
 *
 * Only `running` work earns the in-progress wording; every other case names what it actually is.
 * With no activity at all the verdict is the idle one, which is the case the defect reported.
 */
export function describeBlueprintSetup(
	setup: BlueprintSetupContext | undefined,
): BlueprintSetupVerdict {
	const missing = describeMissingSetup(setup?.missingArtifacts ?? []);
	const activity = setup?.activity ?? null;
	if (activity === null) return { reason: missing, state: 'setup_incomplete' };
	switch (activity.lifecycle) {
		case 'failed':
			return { reason: `${activity.label} failed. ${missing}`, state: 'blocked' };
		case 'queued':
			return {
				reason: `${activity.label} is queued and has not started. ${missing}`,
				state: 'queued',
			};
		case 'running':
			return { reason: `${activity.label} is in progress.`, state: 'preparing' };
		case 'stopped':
			return { reason: `${activity.label} was stopped. ${missing}`, state: 'blocked' };
		case 'waiting_approval':
			return {
				reason: `${activity.label} is waiting for approval. ${missing}`,
				state: 'blocked',
			};
	}
}
