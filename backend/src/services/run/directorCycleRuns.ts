import type { DirectorCycleStage } from 'aidd-shared';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import type { BackendName } from 'aidd-shared/plan/types';

import { desc, eq, gt, inArray, or, type SQL } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { WebDatabase } from '../../db/client.ts';
import type { RunRecord, WebRunStatus } from '../../types.ts';

import { directorCycles, runs } from '../../db/schema.ts';
import { encodeProjectId } from '../../paths.ts';
import { DIRECTOR_PROJECT_NAME, RECENT_RUN_LOOKBACK_MS } from './types.ts';

type DirectorCycleRow = typeof directorCycles.$inferSelect;

const DIRECTOR_BACKEND: BackendName = 'native';
export interface DirectorCycleRunContext {
	config: ResolvedConfig & { web: ResolvedWebConfig };
	db: WebDatabase;
}

export interface DirectorCycleArtifacts {
	contextExists: boolean;
	contextPath: string;
	fleetSummaryExists: boolean;
	fleetSummaryPath: string;
	outputExists: boolean;
	outputPath: string;
}

function directorProjectPath(ctx: DirectorCycleRunContext): string {
	return join(ctx.config.web.dataDir, 'director');
}

export function directorCycleArtifacts(
	ctx: DirectorCycleRunContext,
	cycleId: string
): DirectorCycleArtifacts {
	const cycleDir = directorProjectPath(ctx);
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

export function directorCycleStage(
	ctx: DirectorCycleRunContext,
	row: Pick<DirectorCycleRow, 'id' | 'status'>
): DirectorCycleStage {
	if (row.status === 'completed') return 'completed';
	if (row.status === 'failed') return 'failed';
	const artifacts = directorCycleArtifacts(ctx, row.id);
	if (artifacts.outputExists) return 'persisting_results';
	if (artifacts.contextExists) return 'running_backend';
	if (artifacts.fleetSummaryExists) return 'writing_context';
	return 'starting';
}

function runStatusFromCycle(status: string): WebRunStatus {
	if (status === 'completed' || status === 'failed' || status === 'running') return status;
	return 'failed';
}

function directorCycleSummary(ctx: DirectorCycleRunContext, row: DirectorCycleRow): null | string {
	const status = runStatusFromCycle(row.status);
	if (status === 'running') {
		return `Director cycle is ${directorCycleStage(ctx, row).replaceAll('_', ' ')}.`;
	}
	if (status === 'failed') return row.failureReason ?? 'Director cycle failed.';
	return `Director cycle completed with ${row.totalSuggestions} suggestion(s).`;
}

export function toDirectorCycleRunRecord(
	ctx: DirectorCycleRunContext,
	row: DirectorCycleRow
): RunRecord {
	const status = runStatusFromCycle(row.status);
	const terminal = status !== 'running';
	const projectPath = directorProjectPath(ctx);
	const now = Date.now();
	return {
		activityState: terminal ? null : directorCycleStage(ctx, row),
		aiddDirty: row.aiddDirty,
		aiddRevision: row.aiddRevision,
		aiddVersion: row.aiddVersion,
		aiSummary: null,
		backend: DIRECTOR_BACKEND,
		canKill: false,
		canReadOutput: true,
		canStop: false,
		chainedFromRunId: null,
		completedAt: row.completedAt,
		continuationReason: null,
		durationMs: row.completedAt === null ? null : row.completedAt - row.startedAt,
		errorMessage: status === 'failed' ? row.failureReason : null,
		exitCode: status === 'running' ? null : status === 'completed' ? 0 : 1,
		heartbeatAt: terminal ? null : now,
		id: row.id,
		launchCommand: null,
		logPath: null,
		mode: 'director',
		model: null,
		pid: null,
		pipelineSessionId: null,
		projectId: encodeProjectId(projectPath),
		projectName: DIRECTOR_PROJECT_NAME,
		projectPath,
		provider: null,
		reasoningEffort: null,
		source: 'director',
		startedAt: row.startedAt,
		status,
		stopReason: terminal ? (status === 'completed' ? 'completed' : 'exit_error') : null,
		// Director cycles are not stoppable from the Runs page (canStop false), so they never
		// surface a pending stop request.
		stopRequested: false,
		summary: directorCycleSummary(ctx, row),
	};
}

function cycleStatusFilter(status: undefined | WebRunStatus): null | SQL {
	if (status === 'completed' || status === 'failed' || status === 'running') {
		return eq(directorCycles.status, status);
	}
	if (status) return null;
	const cutoff = Date.now() - RECENT_RUN_LOOKBACK_MS;
	const recentOrRunning = or(
		eq(directorCycles.status, 'running'),
		gt(directorCycles.startedAt, cutoff)
	);
	if (!recentOrRunning) throw new Error('Failed to build director cycle recency filter.');
	return recentOrRunning;
}

async function cycleIdsWithRunRows(
	ctx: DirectorCycleRunContext,
	cycleIds: string[]
): Promise<Set<string>> {
	if (cycleIds.length === 0) return new Set();
	const rows = await ctx.db
		.select({ directorCycleId: runs.directorCycleId })
		.from(runs)
		.where(inArray(runs.directorCycleId, cycleIds));
	return new Set(
		rows
			.map((row) => row.directorCycleId)
			.filter((cycleId): cycleId is string => cycleId !== null)
	);
}

export async function listDirectorCycleRunRecords(
	ctx: DirectorCycleRunContext,
	status?: WebRunStatus
): Promise<RunRecord[]> {
	const where = cycleStatusFilter(status);
	if (where === null) return [];
	const cycleRows = await ctx.db
		.select()
		.from(directorCycles)
		.where(where)
		.orderBy(desc(directorCycles.startedAt))
		.limit(200);
	const backedCycleIds = await cycleIdsWithRunRows(
		ctx,
		cycleRows.map((row) => row.id)
	);
	return cycleRows
		.filter((row) => !backedCycleIds.has(row.id))
		.map((row) => toDirectorCycleRunRecord(ctx, row));
}

export async function getDirectorCycleRunRecord(
	ctx: DirectorCycleRunContext,
	id: string
): Promise<RunRecord | undefined> {
	const row = (
		await ctx.db.select().from(directorCycles).where(eq(directorCycles.id, id)).limit(1)
	)[0];
	if (!row) return undefined;
	const backed = await ctx.db
		.select({ id: runs.id })
		.from(runs)
		.where(eq(runs.directorCycleId, id))
		.limit(1);
	if (backed.length > 0) return undefined;
	return toDirectorCycleRunRecord(ctx, row);
}
