/**
 * The shapes the activity derivation reads and returns.
 *
 * Separated from the derivation so each file stays one thing. The input shapes are structural,
 * so the frontend's `ProjectLocalRun`/`ProjectLocalIteration` and the backend's `…Dto`
 * counterparts both satisfy them without either side importing the other’s types.
 */

/** A commit a run recorded. Same two fields on both sides of the wire. */
export interface ActivityCommitRef {
	hash: string;
	subject: string;
}

/** Who executed the work, when any of it was recorded. */
export interface ActivityExecutionIdentity {
	backend: null | string;
	model: null | string;
	provider: null | string;
	reasoningEffort: null | string;
}

/** The fields of a local run entry this derivation reads. */
export interface ActivityRunInput {
	aiSummary: null | string;
	backend: null | string;
	commitsCreated: ActivityCommitRef[];
	/** True total; `commitsCreated` is capped at 50 entries, so the array cannot supply it. */
	commitsCreatedCount: number;
	completedFeatures: string[];
	durationMs: null | number;
	endedAt: null | string;
	executionMode: null | string;
	exitCode: null | number;
	filesCreated: number;
	filesEdited: number;
	mode: null | string;
	model: null | string;
	phase: null | string;
	provider: null | string;
	reasoningEffort: null | string;
	runId: null | string;
	source: null | string;
	startedAt: null | string;
	stopReason: null | string;
	summary: null | string;
}

/** The fields of a local iteration entry this derivation reads. */
export interface ActivityIterationInput {
	backend: null | string;
	completedFeatures: string[];
	durationMs: null | number;
	endedAt: null | string;
	executionMode: null | string;
	finalChecks: {
		build?: null | string | undefined;
		format?: null | string | undefined;
		smokeQc?: null | string | undefined;
		typecheck?: null | string | undefined;
	} | null;
	iteration: null | number;
	runId: null | string;
	selectedFeatures: string[];
	startedAt: null | string;
	status: string;
	summary: null | string;
}

/** One timeline entry, in the vocabulary both surfaces render. */
export interface ActivityEntry {
	commits: ActivityCommitRef[];
	durationMs: null | number;
	executionIdentity: ActivityExecutionIdentity | null;
	id: string;
	runId: null | string;
	sourceLabel: null | string;
	status: string;
	statusLabel: string;
	summary: null | string;
	timestamp: string;
	timeValue: number;
	title: string;
	traceLabel: string;
}
