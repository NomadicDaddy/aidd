import type { DirectorOutput } from 'aidd-shared';
import type { RunInitiator } from 'aidd-shared/metadata/active-runs';

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebRunStatus } from '../../types.ts';
import type {
	CycleContext,
	CycleContextDocument,
	CycleExecutorDeps,
	DirectCycleResult,
} from './cycleExecutorTypes.ts';
import type { FleetSummary } from './types.ts';

import { webLogger } from '../../logger.ts';
import { IN_FLIGHT_RUN_STATUSES } from '../run/types.ts';
import { type DirectorChatService } from './chatService.ts';
import {
	buildDirectCyclePrompt,
	normalizeDirectDirectorOutput,
	statusToExitCode,
} from './directCycleNormalizer.ts';
import {
	cleanText,
	maxProfileTextLength,
	normalizeBackend,
	normalizeReasoningEffort,
	SUGGESTION_DEDUP_WINDOW_MS,
} from './helpers.ts';
import { type DirectorProfileService } from './profileService.ts';
import { readRecentSuggestionHistory, type SuggestionHistoryEntry } from './suggestionHistory.ts';

export type { CycleContext, CycleExecutorDeps, DirectCycleResult } from './cycleExecutorTypes.ts';

export async function writeCycleContext(
	cycleDir: string,
	cycleId: string,
	input: { directive?: string; sessionId?: string },
	profileService: DirectorProfileService,
	chatService: DirectorChatService,
	recentSuggestions: SuggestionHistoryEntry[] = [],
): Promise<CycleContext> {
	const directive = cleanText(input.directive, maxProfileTextLength);
	// Suggestion history alone justifies a context document, even for scheduled cycles without a
	// session or directive. The CLI fallback reads the same context.json, so both AI paths can avoid
	// recreating identical suggestions.
	if (!input.sessionId && !directive && recentSuggestions.length === 0) return undefined;
	const profile = await profileService.getProfile();
	const messages = input.sessionId ? await chatService.recentChatMessages(input.sessionId) : [];
	// sessionId is persisted in the context.json so that resume-after-restart
	// (reconcileStaleCycles → awaitAndPersistCycle) can still notify the chat
	// session when the detached run terminalizes.
	const context: CycleContextDocument = {
		directive: directive || null,
		profile,
		recentMessages: messages.map((message) => ({
			content: message.content,
			createdAt: new Date(message.createdAt).toISOString(),
			role: message.role,
		})),
		recentSuggestions,
		sessionId: input.sessionId ?? null,
	};
	const contextPath = join(cycleDir, `${cycleId}-context.json`);
	await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`);
	return { context, contextPath, profile, sessionId: input.sessionId };
}

export async function runDirectCycle(
	deps: CycleExecutorDeps,
	cycleId: string,
	outputPath: string,
	fleetSummary: FleetSummary,
	cycleContext: CycleContext,
): Promise<DirectCycleResult> {
	if (!deps.directAiService.isSurfaceEnabled('directorCycle')) {
		return { directAiError: null, output: null };
	}
	const config = deps.getConfig();
	const profile = cycleContext?.profile ?? (await deps.profileService.getProfile());
	const reasoningEffort = normalizeReasoningEffort(profile.reasoningEffort);
	const meta = deps.directAiService.resolveSurfaceMeta('directorCycle', reasoningEffort);
	deps.setCycleStage(cycleId, 'running_direct_ai', meta);
	let output: DirectorOutput;
	try {
		const rawOutput = await deps.directAiService.completeJson<unknown>({
			cwd: join(config.web.dataDir, 'director'),
			prompt: buildDirectCyclePrompt(fleetSummary, profile, cycleContext?.context),
			reasoningEffort,
			surface: 'directorCycle',
		});
		if (rawOutput === null) return { directAiError: null, output: null };
		output = normalizeDirectDirectorOutput(rawOutput, fleetSummary);
	} catch (err) {
		// A transient direct-AI failure (request timeout, provider 5xx, or a
		// malformed/non-JSON completion) must not fail the whole cycle. Fall back
		// to the slower-but-robust CLI backend path instead of propagating to
		// runCycle's catch (which failCycles it). Errors after this point
		// (writeFile, persistCycleResult) are genuine local failures and are
		// intentionally left to propagate.
		webLogger.warn(
			{ cycleId, err },
			'Direct AI director cycle failed; falling back to CLI backend',
		);
		return {
			directAiError: err instanceof Error ? err.message : String(err),
			output: null,
		};
	}
	await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
	deps.setCycleStage(cycleId, 'persisting_results');
	await deps.persistCycleResult(cycleId, fleetSummary, output, 0, 'ok');
	deps.deleteActiveStage(cycleId);
	await deps.autoLaunchSuggestions(cycleId);
	return { output };
}

export async function executeCycle(
	deps: CycleExecutorDeps,
	cycleId: string,
	cycleDir: string,
	fleetSummary: FleetSummary,
	input: { directive?: string; sessionId?: string },
	directorCwd: string,
	initiator: RunInitiator,
): Promise<{ cycleContext: CycleContext; output: DirectorOutput | undefined }> {
	const fleetSummaryPath = join(cycleDir, `${cycleId}-fleet-summary.json`);
	const outputPath = join(cycleDir, `${cycleId}-output.json`);
	await mkdir(cycleDir, { recursive: true });
	// Best-effort: a history read failure must not block the cycle.
	const recentSuggestions = await readRecentSuggestionHistory(deps.db, {
		sinceMs: Date.now() - SUGGESTION_DEDUP_WINDOW_MS,
	}).catch((err: unknown) => {
		webLogger.warn({ cycleId, err }, 'Director cycle: suggestion-history read failed');
		return [];
	});
	const cycleContext = await writeCycleContext(
		cycleDir,
		cycleId,
		input,
		deps.profileService,
		deps.chatService,
		recentSuggestions,
	);

	// Try direct AI path first
	const directResult = await runDirectCycle(
		deps,
		cycleId,
		outputPath,
		fleetSummary,
		cycleContext,
	);
	if (directResult.output !== null) {
		return { cycleContext, output: directResult.output };
	}
	const directAiError = directResult.directAiError;

	// Fall back to backend (CLI) path
	deps.setCycleStage(cycleId, 'running_backend');
	const runRecord = await deps.runService.launchRun(
		{
			directorCycleId: cycleId,
			directorFleetSummaryPath: fleetSummaryPath,
			directorOutputPath: outputPath,
			...(cycleContext?.contextPath ? { directorContextPath: cycleContext.contextPath } : {}),
			maxIterations: 1,
			mode: 'director',
			projectDir: directorCwd,
			...(cycleContext
				? {
						backend: normalizeBackend(cycleContext.profile.backend),
						reasoningEffort: cycleContext.profile.reasoningEffort,
						...(cycleContext.profile.model
							? { model: cycleContext.profile.model }
							: {}),
					}
				: {}),
		},
		// 'director' is the door, not the intent: the same CLI fallback carries a Run Cycle
		// click and a scheduled sweep. The caller knows which, so it says.
		{ initiator, source: 'director' },
	);
	const output = await awaitAndPersistCycle(
		deps,
		cycleId,
		runRecord.id,
		outputPath,
		fleetSummary,
		directAiError,
	);
	return { cycleContext, output };
}

export async function awaitAndPersistCycle(
	deps: CycleExecutorDeps,
	cycleId: string,
	runId: string,
	outputPath: string,
	fleetSummary: FleetSummary,
	directAiError?: null | string,
): Promise<DirectorOutput | undefined> {
	const status = await waitForCycleRun(deps, runId);
	if (status === undefined || deps.disposed()) return undefined;
	return advanceCycle(deps, cycleId, status, outputPath, fleetSummary, runId, directAiError);
}

export async function advanceCycle(
	deps: CycleExecutorDeps,
	cycleId: string,
	runStatus: WebRunStatus,
	outputPath: string,
	fleetSummary: FleetSummary,
	runId?: string,
	directAiError?: null | string,
): Promise<DirectorOutput | undefined> {
	deps.setCycleStage(cycleId, 'persisting_results');
	const exitCode = statusToExitCode(runStatus);
	const { output, outputStatus } = await deps.readCycleOutput(outputPath);
	// When the backend run failed, lift its own summary/error onto the cycle so the
	// UI can show WHY (e.g. "Dirty working tree exceeds threshold; skipping run.")
	// instead of a bare "failed". statusToExitCode maps non-'completed' run states
	// to a non-zero code, so check exitCode rather than the raw status here. If the
	// direct-AI fast path also failed before this CLI fallback, name both causes so
	// the original direct-AI error isn't lost to a log-only warning.
	const runReason = exitCode !== 0 && runId ? await readRunFailureReason(deps, runId) : null;
	const failureReason = exitCode !== 0 ? combineFailureReasons(directAiError, runReason) : null;
	await deps.persistCycleResult(
		cycleId,
		fleetSummary,
		output,
		exitCode,
		outputStatus,
		failureReason,
	);
	deps.deleteActiveStage(cycleId);
	// Also on the fallback path, and also on the restart-resume that re-enters it: whether a cycle
	// ran through direct AI or through the CLI is an implementation detail, and the operator who
	// switched auto-launch on must not get a different answer depending on which one happened to
	// serve. The launcher itself decides whether this cycle qualifies.
	await deps.autoLaunchSuggestions(cycleId);
	return output;
}

// The orchestrator records a human-readable summary on the run row (and an
// error_message for genuine crashes). Prefer the summary because blocked/skip
// outcomes — the common director failure — carry their explanation there with
// exit_code 0 even though the run is marked failed.
async function readRunFailureReason(
	deps: CycleExecutorDeps,
	runId: string,
): Promise<null | string> {
	try {
		const run = await deps.runService.getRun(runId);
		if (!run) return null;
		const summary = run.summary?.trim();
		if (summary) return summary;
		const errorMessage = run.errorMessage?.trim();
		if (errorMessage) return errorMessage;
	} catch (err) {
		webLogger.warn({ err, runId }, 'Failed to read run failure reason for director cycle');
	}
	return null;
}

// Join the direct-AI fallback cause (if any) with the CLI run's reason. Either may
// be absent: direct AI may have been disabled (no error) or the run reason may be
// unreadable. Returns null only when both are empty, letting persistCycleResult
// apply its own default.
function combineFailureReasons(
	directAiError: null | string | undefined,
	runReason: null | string,
): null | string {
	const parts: string[] = [];
	if (directAiError) parts.push(`Direct AI fell back to CLI: ${directAiError}`);
	if (runReason) parts.push(runReason);
	return parts.length > 0 ? parts.join(' — ') : null;
}

async function waitForCycleRun(
	deps: CycleExecutorDeps,
	runId: string,
): Promise<undefined | WebRunStatus> {
	const pollIntervalMs = 1000;
	for (;;) {
		if (deps.disposed()) return undefined;
		const row = await deps.runService.getRun(runId);
		if (!row) throw new Error(`Cycle run not found: ${runId}`);
		const status = row.status as WebRunStatus;
		// A queued cycle run is waiting for a ceiling slot, not finished.
		if (!IN_FLIGHT_RUN_STATUSES.includes(status)) return status;
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
}
