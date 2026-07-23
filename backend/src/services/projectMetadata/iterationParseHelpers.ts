import {
	isAiddExecutionMode,
	type AiddTriumvirateRoleMetadata,
	type AiddTriumvirateRoles,
} from 'aidd-shared/execution-mode';

import type {
	FinalCheckSummary,
	GitCommitRefDto,
	ProjectLocalIterationDto,
	ProjectLocalRunDto,
} from '../../types.ts';

export interface RawIterationArtifact {
	backend?: unknown;
	completedFeatures?: unknown;
	completionMarkerIssue?: unknown;
	detailsSummary?: { finalChecks?: unknown };
	durationMs?: unknown;
	endedAt?: unknown;
	executionMode?: unknown;
	exitCode?: unknown;
	iteration?: unknown;
	lifecycle?: unknown;
	outcome?: { status?: unknown };
	runId?: unknown;
	scopeOverrun?: unknown;
	selectedFeatures?: unknown;
	startedAt?: unknown;
	summary?: unknown;
	triumvirateRoles?: unknown;
}

export interface RawRunLedgerEntry {
	aiddDirty?: unknown;
	aiddRevision?: unknown;
	aiddVersion?: unknown;
	aiSummary?: unknown;
	artifactWarnings?: unknown;
	backend?: unknown;
	backendExitCode?: unknown;
	commitsCreated?: unknown;
	completedFeatures?: unknown;
	diffStat?: unknown;
	durationMs?: unknown;
	endedAt?: unknown;
	executionMode?: unknown;
	exitCode?: unknown;
	fileChangePathsTruncated?: unknown;
	filesCreated?: unknown;
	filesEdited?: unknown;
	mode?: unknown;
	model?: unknown;
	phase?: unknown;
	provider?: unknown;
	reasoningEffort?: unknown;
	residualDirtySourceFiles?: unknown;
	residualUntrackedFeatureDirs?: unknown;
	runId?: unknown;
	runLedgerDirty?: unknown;
	scopeOverrun?: unknown;
	source?: unknown;
	startedAt?: unknown;
	stopReason?: unknown;
	summary?: unknown;
	totals?: unknown;
	triumvirateRoles?: unknown;
}

// How many of the newest NNN.json artifacts the project listing may observe. Shared by
// the reader (gatherLocalIterations) and the listing cache's fingerprint so cache
// validation never watches more of the directory than the summary can actually reflect.
export const ITERATION_SCAN_LIMIT = 50;

export function iterationEntryNumber(entry: string): null | number {
	const match = entry.match(/^(\d+)\.json$/);
	if (!match?.[1]) return null;
	const value = Number(match[1]);
	return Number.isSafeInteger(value) ? value : null;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function recordValue(value: unknown): null | Record<string, unknown> {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

const commitHashPattern = /^[0-9a-f]{7,40}$/i;
const commitRefLimit = 50;

// Accept only well-formed {hash, subject} entries: the hash is used later as a `git show`
// argument, so anything that is not plain hex is dropped here rather than sanitized downstream.
export function commitRefsFromUnknown(value: unknown): GitCommitRefDto[] {
	if (!Array.isArray(value)) return [];
	const refs: GitCommitRefDto[] = [];
	for (const item of value) {
		const record = recordValue(item);
		if (!record) continue;
		if (typeof record.hash !== 'string' || !commitHashPattern.test(record.hash)) continue;
		if (typeof record.subject !== 'string') continue;
		refs.push({ hash: record.hash, subject: record.subject });
		if (refs.length >= commitRefLimit) break;
	}
	return refs;
}

function triumvirateRoleFromUnknown(value: unknown): AiddTriumvirateRoleMetadata | null {
	const record = recordValue(value);
	if (!record || typeof record.backend !== 'string') return null;
	return {
		backend: record.backend,
		...(typeof record.model === 'string' ? { model: record.model } : {}),
	};
}

function triumvirateRolesFromUnknown(value: unknown): AiddTriumvirateRoles | null {
	const record = recordValue(value);
	if (!record) return null;
	const execution = triumvirateRoleFromUnknown(record.execution);
	const overseer = triumvirateRoleFromUnknown(record.overseer);
	const primary = triumvirateRoleFromUnknown(record.primary);
	const secondary = triumvirateRoleFromUnknown(record.secondary);
	if (!execution || !overseer || !primary || !secondary) return null;
	return { execution, overseer, primary, secondary };
}

const finalCheckKeys = ['build', 'format', 'smokeQc', 'typecheck'] as const;

// Lift the recorded final-check results out of the iteration artifact's detailsSummary. These
// are written even when the iteration exits 0, so the UI can flag a failed acceptance gate
// instead of reporting an unqualified success. Returns null when nothing parseable is present.
function finalChecksFromArtifact(value: unknown): FinalCheckSummary | null {
	const record = recordValue(value);
	if (!record) return null;
	const summary: FinalCheckSummary = {};
	for (const key of finalCheckKeys) {
		const status = record[key];
		if (status === 'passed' || status === 'failed') summary[key] = status;
	}
	return Object.keys(summary).length > 0 ? summary : null;
}

function iterationStatusFromArtifact(raw: RawIterationArtifact): string {
	if (typeof raw.outcome?.status === 'string') return raw.outcome.status;
	if (typeof raw.exitCode === 'number') return raw.exitCode === 0 ? 'success' : 'failed';
	// No terminal outcome yet. The orchestrator writes a 'started' lifecycle artifact
	// (endedAt:null, exitCode:null) at the start of an iteration — before the run is finalized
	// and before any runs.jsonl ledger line exists. Surface an explicit in-progress status so the
	// UI can show a 'running' affordance instead of defaulting to 'unknown'.
	if (raw.lifecycle === 'started') return 'running';
	if (typeof raw.startedAt === 'string' && typeof raw.endedAt !== 'string') return 'running';
	return 'unknown';
}

export function localIterationFromArtifact(raw: RawIterationArtifact): ProjectLocalIterationDto {
	const status = iterationStatusFromArtifact(raw);
	return {
		backend: typeof raw.backend === 'string' ? raw.backend : null,
		completedFeatures: stringArray(raw.completedFeatures),
		completionMarkerIssue:
			typeof raw.completionMarkerIssue === 'string' ? raw.completionMarkerIssue : null,
		durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : null,
		endedAt: typeof raw.endedAt === 'string' ? raw.endedAt : null,
		executionMode: isAiddExecutionMode(raw.executionMode) ? raw.executionMode : null,
		exitCode: typeof raw.exitCode === 'number' ? raw.exitCode : null,
		finalChecks: finalChecksFromArtifact(raw.detailsSummary?.finalChecks),
		iteration: typeof raw.iteration === 'number' ? raw.iteration : null,
		runId: typeof raw.runId === 'string' ? raw.runId : null,
		scopeOverrun: raw.scopeOverrun === true,
		selectedFeatures: stringArray(raw.selectedFeatures),
		startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
		status,
		summary: typeof raw.summary === 'string' ? raw.summary : null,
		triumvirateRoles: triumvirateRolesFromUnknown(raw.triumvirateRoles),
	};
}

export function localRunFromLedgerEntry(raw: RawRunLedgerEntry): ProjectLocalRunDto {
	const totals = recordValue(raw.totals);
	return {
		aiddDirty: typeof raw.aiddDirty === 'boolean' ? raw.aiddDirty : null,
		aiddRevision: typeof raw.aiddRevision === 'string' ? raw.aiddRevision : null,
		aiddVersion: typeof raw.aiddVersion === 'string' ? raw.aiddVersion : null,
		aiSummary: typeof raw.aiSummary === 'string' ? raw.aiSummary : null,
		artifactWarnings: stringArray(raw.artifactWarnings),
		backend: typeof raw.backend === 'string' ? raw.backend : null,
		backendExitCode: typeof raw.backendExitCode === 'number' ? raw.backendExitCode : null,
		commitsCreated: commitRefsFromUnknown(raw.commitsCreated),
		commitsCreatedCount: Array.isArray(raw.commitsCreated) ? raw.commitsCreated.length : 0,
		completedFeatures: stringArray(raw.completedFeatures),
		durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : null,
		endedAt: typeof raw.endedAt === 'string' ? raw.endedAt : null,
		executionMode: isAiddExecutionMode(raw.executionMode) ? raw.executionMode : null,
		exitCode: typeof raw.exitCode === 'number' ? raw.exitCode : null,
		filesCreated: typeof totals?.filesCreated === 'number' ? totals.filesCreated : 0,
		filesEdited: typeof totals?.filesEdited === 'number' ? totals.filesEdited : 0,
		mode: typeof raw.mode === 'string' ? raw.mode : null,
		model: typeof raw.model === 'string' ? raw.model : null,
		phase: typeof raw.phase === 'string' ? raw.phase : null,
		provider: typeof raw.provider === 'string' ? raw.provider : null,
		reasoningEffort: typeof raw.reasoningEffort === 'string' ? raw.reasoningEffort : null,
		residualDirtySourceFiles: stringArray(raw.residualDirtySourceFiles),
		residualUntrackedFeatureDirs: stringArray(raw.residualUntrackedFeatureDirs),
		runId: typeof raw.runId === 'string' ? raw.runId : null,
		runLedgerDirty: raw.runLedgerDirty === true,
		scopeOverrun: raw.scopeOverrun === true,
		source: typeof raw.source === 'string' ? raw.source : null,
		startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
		stopReason: typeof raw.stopReason === 'string' ? raw.stopReason : null,
		summary: typeof raw.summary === 'string' ? raw.summary : null,
		triumvirateRoles: triumvirateRolesFromUnknown(raw.triumvirateRoles),
	};
}
