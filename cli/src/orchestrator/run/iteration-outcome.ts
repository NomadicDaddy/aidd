import type { AgentEvent } from 'aidd-shared/backends/types';
import type { ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { hasMalformedResultMarker, orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { GitCommitSummary } from './types.ts';

import { asksUserDecisionInProse, isAskUserQuestionEvent } from '../details/shared.ts';
import { gitDirtyFileCount } from './git.ts';

const AIDD_ARTIFACT_MTIME_TOLERANCE_MS = 1000;

export interface IterationOutcomeClassification {
	askedUserQuestion: boolean;
	completedAfterBackendInterruption: boolean;
	endedWithKilledBackgroundTasks: boolean;
	findingsContractDropped: boolean;
	malformedResultMarker: boolean;
	missingAiddResult: boolean;
	missingAuditArtifacts: boolean;
	recordedExitCode: number;
	residualDirtyFilesCount: number;
}

export async function classifyIterationOutcome(input: {
	completedResultFeature: string | undefined;
	completionFinalizedBeforeBackendExit: boolean;
	events: AgentEvent[];
	exitCode: number;
	iterationCommits: GitCommitSummary[];
	modeResult: ModeResult;
	plan: RunPlan;
	startedAtMs: number;
	structuredResult: Record<string, unknown> | undefined;
	work: SelectedWork;
}): Promise<IterationOutcomeClassification> {
	const {
		completedResultFeature,
		completionFinalizedBeforeBackendExit,
		events,
		exitCode,
		iterationCommits,
		modeResult,
		plan,
		startedAtMs,
		structuredResult,
		work,
	} = input;

	const residualDirtyFilesCount = await gitDirtyFileCount(runRepoDir(plan));
	const completedAfterBackendIdle =
		completedResultFeature !== undefined && exitCode === orchestratorExitCodes.idleTimeout;
	const completedAfterBackendAbort =
		completedResultFeature !== undefined && exitCode === orchestratorExitCodes.aborted;
	const completedAfterBackendInterruption =
		completedAfterBackendIdle || completedAfterBackendAbort;
	const completedAuditsArtifact = modeResult.artifacts?.completedAudits;
	const invalidAuditReportsArtifact = modeResult.artifacts?.invalidAuditReports;
	const perAuditReportPathsArtifact = modeResult.artifacts?.perAuditReportPaths;
	const completedAuditsCount = Array.isArray(completedAuditsArtifact)
		? completedAuditsArtifact.length
		: 0;
	const perAuditReportPathsCount =
		typeof perAuditReportPathsArtifact === 'object' && perAuditReportPathsArtifact !== null
			? Object.keys(perAuditReportPathsArtifact).length
			: 0;
	const hasInvalidAuditReports =
		Array.isArray(invalidAuditReportsArtifact) && invalidAuditReportsArtifact.length > 0;
	// A recognized invalid report is not a missing artifact: audit mode parsed the result,
	// rejected it before persistence, and left the audit in its retry queue. Preserve exit 0
	// here so post-iteration can select that pending audit again. Truly absent/unrecognized
	// output still takes missing_audit_artifacts below.
	const missingAuditArtifacts =
		plan.mode === 'audit' &&
		exitCode === orchestratorExitCodes.success &&
		completedAuditsCount === 0 &&
		perAuditReportPathsCount === 0 &&
		!hasInvalidAuditReports;
	// Whether the .aidd-artifact fallback below is consulted at all. Feature work must emit
	// AIDD_RESULT, so .aidd writes alone never stand in for a marker there — and the warning
	// must not claim to have checked for artifacts it never looked at.
	const aiddFallbackApplies = work.kind === 'generic';
	// Coding mode confirmed the agent invoked the STOP-AND-PARK hatch: it reported blocked live
	// verification and parked the selected feature as waiting_approval rather than claiming a
	// completion it could not stand behind. The prompt's own result contract tells it not to emit
	// AIDD_RESULT for blocked work, so the absent marker is compliance, not a missing result —
	// exempt it the way completedAuditsArtifact exempts audit mode.
	const verificationBlockedParked =
		typeof modeResult.artifacts?.verificationBlockedParked === 'string';
	const missingAiddResult =
		!missingAuditArtifacts &&
		!verificationBlockedParked &&
		// Initializer/onboarding phase iterations run a phase prompt that never emits an
		// AIDD_RESULT marker and complete no backlog feature, so the phase-agnostic
		// missing-result heuristic must not classify a successful phase iteration as a failure
		// (exit 73 / exit_error). Feature ('coding') iterations remain subject to the check.
		work.kind !== 'phase' &&
		// Interview mode owns its completion semantics entirely: question generation checks
		// the questions file and answer iterations write response files, with the mode's own
		// bounded retry + fatal path for repeated misses. Classifying a no-write generation
		// attempt as missing_aidd_result would end the run at exit 73 before the mode's
		// escalating retries ever run.
		plan.mode !== 'interview' &&
		structuredResult === undefined &&
		exitCode === orchestratorExitCodes.success &&
		completedResultFeature === undefined &&
		iterationCommits.length === 0 &&
		!completionFinalizedBeforeBackendExit &&
		// Directive runs whose entire deliverable lives under .aidd/ (e.g. metadata-only
		// pipeline steps like project-intake codebase analysis) may produce real artifacts
		// without any commits: intake targets commonly gitignore .aidd/, so iterationCommits
		// stays empty even when files were written. Check the filesystem for files modified
		// since the iteration started — any such files under .aidd/ count as legitimate
		// completion evidence, mirroring how completedAuditsArtifact exempts audit mode.
		// Genuine no-op directive runs (no marker, no commits, no .aidd writes) still fall
		// through to missing_aidd_result with exit 73 as before.
		!(aiddFallbackApplies && (await hasFreshAiddArtifacts(runRepoDir(plan), startedAtMs)));
	// Prose counts as well as the tool call: a CLI backend that ends its turn asking the operator to
	// choose has stopped for input just as surely as a native loop that called AskUserQuestion, and
	// the run must not be classified as though the agent simply produced no result.
	const askedUserQuestion =
		events.some(isAskUserQuestionEvent) || asksUserDecisionInProse(events);
	const endedWithKilledBackgroundTasks = detectKilledBackgroundTasks(events);
	// The marker was emitted but its body was a placeholder (`AIDD_RESULT: { … }`) rather than
	// valid JSON, so it parsed to nothing. The native loop nudges a re-emit while the turn is
	// live (evaluateTextOnlyResponse); CLI backends have no such lever and land here, where the
	// generic "no marker emitted" warning would misattribute the cause. Name the real one.
	const malformedResultMarker =
		structuredResult === undefined && hasMalformedResultMarker(events);
	if (missingAuditArtifacts) {
		console.warn(
			`[orchestrator] Audit iteration exited normally but produced no report artifacts; recording missing_audit_artifacts.`,
		);
	}
	if (missingAiddResult && !askedUserQuestion) {
		if (malformedResultMarker) {
			console.warn(
				`[orchestrator] Backend emitted an AIDD_RESULT marker whose body was not valid JSON — typically a placeholder such as \`AIDD_RESULT: { ... }\` instead of the real payload — so the result could not be parsed and the iteration's work was not recorded; recording missing_aidd_result.`,
			);
		} else if (endedWithKilledBackgroundTasks) {
			console.warn(
				`[orchestrator] Backend exited normally without emitting AIDD_RESULT, and still-running background tasks were killed at session teardown — the agent likely ended its turn while waiting on a backgrounded command (e.g. a quality gate) that can never notify a headless session; recording missing_aidd_result.`,
			);
		} else if (aiddFallbackApplies) {
			console.warn(
				`[orchestrator] Backend exited normally without emitting AIDD_RESULT and no fallback completion was detected (no commits, no .aidd artifacts); recording missing_aidd_result.`,
			);
		} else {
			// Only generic work consults the .aidd fallback, so claiming ".aidd artifacts" were
			// absent here would assert a check that never ran — and .aidd/ is commonly gitignored,
			// so an agent that parked feature state on disk trips this path with a dirty .aidd tree.
			console.warn(
				`[orchestrator] Backend exited normally without emitting AIDD_RESULT and made no commits; recording missing_aidd_result. Feature work must emit the marker — .aidd writes alone are not completion evidence.`,
			);
		}
	}
	const findingsContractWarning =
		plan.mode === 'audit' ? modeResult.artifacts?.findingsContractWarning : undefined;
	// An audit batch that writes multiple reports but emits zero structured findings has
	// dropped the findings contract (report prose without populating auditFindings). Treat it
	// as a run failure rather than a clean completion so the result reads as exit_error and the
	// pipeline/operator is forced to look, instead of trusting an empty-but-green audit pass.
	const findingsContractDropped =
		typeof findingsContractWarning === 'string' && exitCode === orchestratorExitCodes.success;
	if (typeof findingsContractWarning === 'string') {
		console.warn(`[audit-mode] ${findingsContractWarning}`);
	}
	const recordedExitCode = completedAfterBackendInterruption
		? orchestratorExitCodes.success
		: missingAuditArtifacts ||
			  findingsContractDropped ||
			  (missingAiddResult && !askedUserQuestion)
			? orchestratorExitCodes.missingResult
			: exitCode;

	return {
		askedUserQuestion,
		completedAfterBackendInterruption,
		endedWithKilledBackgroundTasks,
		findingsContractDropped,
		malformedResultMarker,
		missingAiddResult,
		missingAuditArtifacts,
		recordedExitCode,
		residualDirtyFilesCount,
	};
}

// When a claude-code session ends while background tasks (run_in_background commands,
// Monitors) are still running, the CLI kills them at teardown and emits system
// task_updated events with a killed status on stdout. Those events are never parsed
// into typed AgentEvents — they only survive inside raw_log chunks — so detection is a
// substring match. Their presence alongside missing_aidd_result means the agent ended
// its turn waiting on a backgrounded command (typically a quality gate) that a headless
// session can never resume from.
function detectKilledBackgroundTasks(events: AgentEvent[]): boolean {
	return events.some(
		(event) =>
			event.type === 'raw_log' &&
			event.chunk.includes('"subtype":"task_updated"') &&
			event.chunk.includes('"status":"killed"'),
	);
}

// Check whether any files under .aidd/ were modified at or after the iteration start
// timestamp. This is a filesystem-level check independent of git: metadata-only projects
// commonly gitignore .aidd/, so git status/porcelain does not see those writes. The function
// returns true when at least one regular file under .aidd/ has an mtime >= startedAtMs,
// indicating the backend wrote artifacts during this iteration.
// Entries under .aidd/ that are NOT evidence the agent did anything.
//
// aidd writes its own bookkeeping here on every single run — active-runs records, per-iteration
// artifacts, and the runs.jsonl ledger (see metadata/active-runs/record.ts and
// metadata/store/runHistory.ts). Counting those made this check structurally always true: it
// measured that a run happened, never that the agent produced anything. A skill run that wrote no
// map, no changelog, made no commit and emitted no marker still exited 0 as "finished with exit
// code 0", because aidd's own telemetry had freshened .aidd/ underneath it.
//
// CHANGELOG.md is excluded for a different reason: every prompt instructs the agent to record what
// happened there, so it appears on failure as readily as on success — "blocked, awaiting a
// decision" is narration, not work.
//
// reports/ is deliberately NOT excluded wholesale: skill deliverables land there
// (commit-archaeology-*.md, feature-coverage-audit-*.md) alongside orchestrator session files, so
// only the session JSON is filtered.
const ORCHESTRATOR_OWNED_ENTRIES = new Set([
	'.stop',
	'active-runs',
	'CHANGELOG.md',
	'iterations',
	'runs.jsonl',
]);
const ORCHESTRATOR_OWNED_CHILD = /^session-.*\.json$/i;

async function hasFreshAiddArtifacts(projectDir: string, startedAtMs: number): Promise<boolean> {
	const aiddDir = join(projectDir, '.aidd');
	let topNames: string[];
	try {
		topNames = await readdir(aiddDir);
	} catch {
		return false;
	}
	// Only scan top-level entries and their direct children — .aidd/ is shallow
	// enough that a single level rarely misses real artifacts, and deep recursive
	// scans on large .aidd/ trees (hundreds of feature dirs, large run logs) would
	// add latency to every iteration's finalization for no benefit.
	for (const name of topNames) {
		const entryPath = join(aiddDir, name);
		let entryStat: Awaited<ReturnType<typeof stat>>;
		try {
			entryStat = await stat(entryPath);
		} catch {
			continue;
		}
		// Skipped before the directory descent, so the entry and its children are both ignored.
		if (ORCHESTRATOR_OWNED_ENTRIES.has(name)) continue;
		// Only regular files are artifacts. A directory's mtime moves whenever anything is written
		// inside it — including the orchestrator-owned files filtered below — so counting it would
		// reinstate exactly the leak this filtering exists to close.
		if (!entryStat.isDirectory() && isFreshArtifactMtime(entryStat.mtimeMs, startedAtMs)) {
			return true;
		}
		if (entryStat.isDirectory()) {
			// Check direct children — this catches artifacts like
			// .aidd/audit-reports/CODEBASE_ANALYSIS-2026-06-10.md without recursing
			// into deep trees like .aidd/features/*/feature.json.
			let children: string[];
			try {
				children = await readdir(entryPath);
			} catch {
				continue;
			}
			for (const child of children) {
				if (ORCHESTRATOR_OWNED_CHILD.test(child)) continue;
				try {
					const childStat = await stat(join(entryPath, child));
					if (childStat.isDirectory()) continue;
					if (isFreshArtifactMtime(childStat.mtimeMs, startedAtMs)) return true;
				} catch {
					continue;
				}
			}
		}
	}
	return false;
}

function isFreshArtifactMtime(mtimeMs: number, startedAtMs: number): boolean {
	return mtimeMs + AIDD_ARTIFACT_MTIME_TOLERANCE_MS >= startedAtMs;
}
