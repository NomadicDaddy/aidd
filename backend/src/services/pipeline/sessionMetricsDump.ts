import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { ReportBuilder } from './reportBuilder.ts';

import { summarizeSessionOutcome } from './outcomeSummary.ts';
import { sessionMetricsFilePath } from './sessionMetricsPath.ts';

// Terminal session fields, supplied at session end so the dump reflects the final state
// even though it is written *before* finishSession persists that state (so consumers can
// never observe a completed session whose dump is missing). Omitted for the mid-session
// refresh after each top-level step, where the live 'running' row is used as-is.
export interface SessionMetricsTerminal {
	completedAt: number;
	status: string;
}

// Writes .aidd/runtime/pipeline-sessions/<id>/metrics.json so a report step (e.g.
// new-app-from-idea's first-session report) can read per-step timings and outcomes without
// DB access. Called after each top-level step (live 'running' state) and once more at
// session end with the terminal override. Best-effort and backend-written, so it bypasses
// the metadata-only write guard (which only governs agent runs). Lives under .aidd/,
// already allowlisted.
//
// Consumers are handed the exact path via the {sessionMetricsPath} step parameter, never a
// glob: two pipelines running in one project each refresh their own file, so picking the
// most recently modified one can silently summarize the wrong session.
export async function dumpSessionMetrics(
	report: ReportBuilder,
	sessionId: string,
	projectDir: string,
	terminal?: SessionMetricsTerminal,
): Promise<void> {
	try {
		const built = await report.getReport(sessionId);
		if (!built) return;
		const completedAt = terminal?.completedAt ?? built.session.completedAt;
		// producedArtifacts / failedStepNames let a report consumer see what survived a
		// partial-failure session (which steps still produced value, which ones failed)
		// without re-deriving it from the raw step list. baseOk is irrelevant here — only
		// the artifact/failure lists are read from the summary, not its status.
		const outcome = summarizeSessionOutcome(true, built.stepResults);
		const payload = {
			completedAt,
			durationMs:
				completedAt !== null
					? completedAt - built.session.startedAt
					: built.session.durationMs,
			failedStepNames: outcome.failedStepNames,
			producedArtifacts: outcome.producedArtifacts,
			recipeId: built.session.recipeId,
			recipeName: built.session.recipeName,
			sessionId,
			startedAt: built.session.startedAt,
			status: terminal?.status ?? built.session.status,
			// Attempt identity travels with each step entry: a retried step contributes one entry
			// per attempt, and without these two fields a consumer sees two same-named entries
			// with different outcomes and no way to tell which one decided the step.
			steps: built.stepResults.map((step) => ({
				attemptKind: step.attemptKind,
				attemptNumber: step.attemptNumber,
				depth: step.depth,
				durationMs: step.durationMs,
				errorMessage: step.errorMessage,
				name: step.stepName,
				runId: step.runId,
				status: step.status,
				stepType: step.stepType,
			})),
		};
		const target = sessionMetricsFilePath(projectDir, sessionId);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, JSON.stringify(payload, null, '\t'), 'utf8');
	} catch {
		// Best-effort instrumentation; never fail a session over its metrics dump.
	}
}
