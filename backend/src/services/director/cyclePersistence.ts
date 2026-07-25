import type {
	DirectAiMeta,
	DirectorCycleArtifacts,
	DirectorCycleRecord,
	DirectorCycleStage,
	DirectorOutput,
} from 'aidd-shared';

import { and, desc, eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands } from '../../db/commands.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { DirectorConfigProvider, DirectorOutputStatus, FleetSummary } from './types.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { directorCycles, runs } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { type DirectorChatService } from './chatService.ts';
import { type ActiveCycleState } from './cycleScheduler.ts';
import { isDirectorOutput, SUGGESTION_DEDUP_WINDOW_MS } from './helpers.ts';

const DIRECTOR_MISSING_MARKER = 'director_output_missing';
const DIRECTOR_INVALID_MARKER = 'director_output_invalid';

type CycleRunRow = typeof runs.$inferSelect;

export interface CyclePersistenceDeps {
	chatService: DirectorChatService;
	commands: DbCommands;
	db: WebDatabase;
	getConfig: DirectorConfigProvider;
	hub: WebSocketHub;
}

export function cycleArtifacts(
	getConfig: DirectorConfigProvider,
	cycleId: string,
): DirectorCycleArtifacts {
	const cycleDir = join(getConfig().web.dataDir, 'director');
	const contextPath = join(cycleDir, `${cycleId}-context.json`);
	const fleetSummaryPath = join(cycleDir, `${cycleId}-fleet-summary.json`);
	const outputPath = join(cycleDir, `${cycleId}-output.json`);
	return {
		contextExists: existsSync(contextPath),
		contextPath,
		fleetSummaryExists: existsSync(fleetSummaryPath),
		fleetSummaryPath,
		outputExists: existsSync(outputPath),
		outputPath,
	};
}

export function toCycleRecord(
	row: {
		completedAt: null | number;
		failureReason?: null | string;
		fleetHealthScore: null | number;
		id: string;
		startedAt: number;
		status: string;
		totalSuggestions: null | number;
	},
	getConfig: DirectorConfigProvider,
	activeStages: Map<string, ActiveCycleState>,
): DirectorCycleRecord {
	const status = cycleStatus(row.status);
	const activeState = activeStages.get(row.id);
	return {
		artifacts: cycleArtifacts(getConfig, row.id),
		completedAt: row.completedAt,
		directAiMeta: activeState?.directAiMeta ?? null,
		failureReason: status === 'failed' ? (row.failureReason ?? null) : null,
		fleetHealthScore: row.fleetHealthScore,
		id: row.id,
		stage: cycleStage(row, status, activeStages, getConfig),
		startedAt: row.startedAt,
		status,
		totalSuggestions: row.totalSuggestions ?? 0,
	};
}

function cycleStatus(status: string): DirectorCycleRecord['status'] {
	if (status === 'completed' || status === 'failed' || status === 'running') return status;
	return 'failed';
}

function cycleStage(
	row: { id: string; status: string },
	status: DirectorCycleRecord['status'],
	activeStages: Map<string, ActiveCycleState>,
	getConfig: DirectorConfigProvider,
): DirectorCycleStage {
	if (status === 'completed') return 'completed';
	if (status === 'failed') return 'failed';
	const activeState = activeStages.get(row.id);
	if (activeState) return activeState.stage;
	const artifacts = cycleArtifacts(getConfig, row.id);
	if (artifacts.outputExists) return 'persisting_results';
	if (artifacts.contextExists) return 'running_backend';
	if (artifacts.fleetSummaryExists) return 'writing_context';
	return 'starting';
}

export async function readFleetSummary(path: string): Promise<FleetSummary | undefined> {
	try {
		const text = await readFile(path, 'utf8');
		return JSON.parse(text) as FleetSummary;
	} catch {
		return undefined;
	}
}

export async function readCycleOutput(
	outputPath: string,
): Promise<{ output: DirectorOutput | undefined; outputStatus: DirectorOutputStatus }> {
	let text: string;
	try {
		text = await readFile(outputPath, 'utf8');
	} catch {
		return { output: undefined, outputStatus: 'missing' };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { output: undefined, outputStatus: 'invalid' };
	}
	if (!isDirectorOutput(parsed)) {
		return { output: undefined, outputStatus: 'invalid' };
	}
	// CLI mode director writes the file with a marker in
	// fleetSummary.crossProjectPatterns when its inner resolution failed.
	const patterns = parsed.fleetSummary.crossProjectPatterns ?? [];
	if (patterns.includes(DIRECTOR_MISSING_MARKER)) {
		return { output: parsed, outputStatus: 'missing' };
	}
	if (patterns.includes(DIRECTOR_INVALID_MARKER)) {
		return { output: parsed, outputStatus: 'invalid' };
	}
	return { output: parsed, outputStatus: 'ok' };
}

export async function findCycleRun(
	db: WebDatabase,
	cycleId: string,
): Promise<CycleRunRow | undefined> {
	const rows = await db
		.select()
		.from(runs)
		.where(and(eq(runs.directorCycleId, cycleId)))
		.orderBy(desc(runs.startedAt))
		.limit(1);
	return rows[0];
}

export async function persistCycleResult(
	deps: CyclePersistenceDeps,
	cycleId: string,
	fleetSummary: FleetSummary,
	output: DirectorOutput | undefined,
	exitCode: number,
	outputStatus: DirectorOutputStatus | undefined,
	failureReason?: null | string,
): Promise<void> {
	const createdAt = Date.now();
	const cycleFailed = exitCode !== 0 || (outputStatus !== undefined && outputStatus !== 'ok');
	const status: DirectorCycleRecord['status'] = cycleFailed ? 'failed' : 'completed';
	const totalSuggestions = cycleFailed ? 0 : (output?.suggestions.length ?? 0);
	const resolvedReason = cycleFailed
		? (failureReason ?? defaultFailureReason(exitCode, outputStatus))
		: null;
	// Invariant: suggestion inserts and the terminal cycle update are committed atomically — the
	// persistCycleResult command runs them inside one transaction in the DB worker.
	const outcome = await withSqliteRetry(
		() =>
			deps.commands.persistCycleResult({
				createdAt,
				cycleId,
				cycleUpdate: {
					completedAt: Date.now(),
					failureReason: resolvedReason,
					fleetHealthScore: fleetSummary.fleetAggregations.fleetHealthScore,
					status,
					totalSuggestions,
				},
				dedupWindowMs: SUGGESTION_DEDUP_WINDOW_MS,
				suggestions: cycleFailed ? [] : (output?.suggestions ?? []),
			}),
		{ label: 'director.persistCycleResult' },
	);
	if (outcome.suppressed > 0) {
		webLogger.info(
			{ cycleId, inserted: outcome.inserted, suppressed: outcome.suppressed },
			'Director suggestions suppressed as recently user-dismissed duplicates',
		);
	}
	broadcastCycle(deps.hub, cycleId, status, status, outcome.inserted);
}

// Last-resort explanation when no run summary/error was captured. Distinguishes a
// non-zero backend exit from a structurally bad/absent output artifact so the UI
// still says something more useful than a bare "failed".
function defaultFailureReason(
	exitCode: number,
	outputStatus: DirectorOutputStatus | undefined,
): string {
	if (outputStatus === 'missing') {
		return 'Director produced no output (the backend run ended before writing results).';
	}
	if (outputStatus === 'invalid') {
		return 'Director output was malformed and could not be parsed.';
	}
	return `Director backend run failed (exit code ${exitCode}).`;
}

export async function failCycle(
	db: WebDatabase,
	hub: WebSocketHub,
	cycleId: string,
	error: unknown,
): Promise<void> {
	const completedAt = Date.now();
	const failureReason = error instanceof Error ? error.message : String(error);
	await db
		.update(directorCycles)
		.set({
			completedAt,
			failureReason,
			status: 'failed',
			totalSuggestions: 0,
		})
		.where(eq(directorCycles.id, cycleId));
	webLogger.error({ cycleId, error }, 'Director cycle failed');
	broadcastCycle(hub, cycleId, 'failed', 'failed');
}

export function broadcastCycle(
	hub: WebSocketHub,
	cycleId: string,
	status: DirectorCycleRecord['status'],
	stage: DirectorCycleStage,
	totalSuggestions?: number,
	directAiMeta?: DirectAiMeta | null,
): void {
	hub.broadcast({
		payload: {
			cycleId,
			stage,
			status,
			...(directAiMeta ? { directAiMeta } : {}),
			...(totalSuggestions === undefined ? {} : { totalSuggestions }),
		},
		type: 'director_cycle',
	});
}

export async function notifyChatSession(
	chatService: DirectorChatService,
	cycleId: string,
	sessionId: string | undefined,
	output: DirectorOutput | undefined,
): Promise<void> {
	if (!sessionId) return;
	await chatService.insertChatMessage({
		content: `Director cycle ${cycleId} completed with ${output?.suggestions.length ?? 0} suggestion(s).`,
		createdAt: Date.now(),
		cycleId,
		role: 'system',
		sessionId,
	});
	await chatService.touchChatSession(sessionId);
}

export async function notifyChatSessionFailure(
	chatService: DirectorChatService,
	cycleId: string,
	sessionId: string | undefined,
	error: unknown,
): Promise<void> {
	if (!sessionId) return;
	const message = error instanceof Error ? error.message : String(error);
	await chatService.insertChatMessage({
		content: `Director cycle ${cycleId} failed: ${message}`,
		createdAt: Date.now(),
		cycleId,
		role: 'system',
		sessionId,
	});
	await chatService.touchChatSession(sessionId);
}
