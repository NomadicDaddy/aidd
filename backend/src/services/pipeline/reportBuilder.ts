import { and, asc, count, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type {
	PipelineActiveTopLevelStep,
	PipelineExecutionIdentity,
	PipelineSessionRecord,
	PipelineSessionReport,
} from '../../types.ts';
import type { RecipeService } from '../recipeService.ts';
import type { PipelineSessionRow } from './types.ts';

import { pipelineSessions, pipelineStepResults, runs } from '../../db/schema.ts';
import { clampLimit, type CursorPage, decodeCursor, encodeCursor } from '../pagination.ts';
import { activeSessionStatuses } from './helpers.ts';
import { indexParkedWorkRuns } from './parkedWork.ts';
import { toSessionRecord, toStepResultRecord } from './recordMappers.ts';

interface PipelineRunIdentityRow extends PipelineExecutionIdentity {
	id: string;
	pipelineSessionId: null | string;
}

interface PipelineIdentityIndexes {
	byRunId: Map<string, PipelineExecutionIdentity>;
	bySessionId: Map<string, PipelineExecutionIdentity[]>;
	parkedWorkBySessionId: Map<string, number>;
}

interface PipelineProgressIndexes {
	activeBySessionId: Map<string, PipelineActiveTopLevelStep>;
	completedBySessionId: Map<string, number>;
	skippedBySessionId: Map<string, number>;
}

function sequenceCounts(bySessionId: Map<string, Set<number>>): Map<string, number> {
	return new Map([...bySessionId].map(([sessionId, sequences]) => [sessionId, sequences.size]));
}

function indexTopLevelStepProgress(
	rows: (typeof pipelineStepResults.$inferSelect)[],
): PipelineProgressIndexes {
	const activeBySessionId = new Map<string, PipelineActiveTopLevelStep>();
	const completedSequencesBySessionId = new Map<string, Set<number>>();
	const skippedSequencesBySessionId = new Map<string, Set<number>>();
	const displayOrderBySessionId = new Map<string, number>();
	for (const row of rows) {
		if (row.depth !== 0 || row.parentStepResultId !== null || row.phase !== 'step') continue;
		if (row.status === 'completed' || row.status === 'skipped') {
			const bySessionId =
				row.status === 'completed'
					? completedSequencesBySessionId
					: skippedSequencesBySessionId;
			const sequences = bySessionId.get(row.sessionId) ?? new Set<number>();
			sequences.add(row.sequenceNumber);
			bySessionId.set(row.sessionId, sequences);
			continue;
		}
		if (row.status !== 'queued' && row.status !== 'running') continue;
		const selectedDisplayOrder = displayOrderBySessionId.get(row.sessionId);
		if (selectedDisplayOrder !== undefined && selectedDisplayOrder >= row.displayOrder)
			continue;
		activeBySessionId.set(row.sessionId, {
			sequenceNumber: row.sequenceNumber,
			stepName: row.stepName,
		});
		displayOrderBySessionId.set(row.sessionId, row.displayOrder);
	}
	return {
		activeBySessionId,
		completedBySessionId: sequenceCounts(completedSequencesBySessionId),
		skippedBySessionId: sequenceCounts(skippedSequencesBySessionId),
	};
}

function executionIdentityKey(identity: PipelineExecutionIdentity): string {
	return [
		identity.backend ?? '',
		identity.model ?? '',
		identity.provider ?? '',
		identity.reasoningEffort ?? '',
	].join('\u001f');
}

function indexExecutionIdentities(rows: PipelineRunIdentityRow[]): PipelineIdentityIndexes {
	const byRunId = new Map<string, PipelineExecutionIdentity>();
	const bySessionId = new Map<string, PipelineExecutionIdentity[]>();
	const keysBySessionId = new Map<string, Set<string>>();
	for (const row of rows) {
		const identity: PipelineExecutionIdentity = {
			backend: row.backend,
			model: row.model,
			provider: row.provider,
			reasoningEffort: row.reasoningEffort,
		};
		byRunId.set(row.id, identity);
		const sessionId = row.pipelineSessionId;
		if (sessionId === null) continue;
		const key = executionIdentityKey(identity);
		const keys = keysBySessionId.get(sessionId) ?? new Set<string>();
		if (keys.has(key)) continue;
		keys.add(key);
		keysBySessionId.set(sessionId, keys);
		const identities = bySessionId.get(sessionId) ?? [];
		identities.push(identity);
		bySessionId.set(sessionId, identities);
	}
	return { byRunId, bySessionId, parkedWorkBySessionId: new Map() };
}

export class ReportBuilder {
	private readonly db: WebDatabase;
	private readonly recipeService: RecipeService | undefined;

	constructor(db: WebDatabase, recipeService?: RecipeService) {
		this.db = db;
		this.recipeService = recipeService;
	}

	async countActiveSessions(): Promise<number> {
		const rows = await this.db
			.select({ count: count() })
			.from(pipelineSessions)
			.where(inArray(pipelineSessions.status, [...activeSessionStatuses]));
		return rows[0]?.count ?? 0;
	}

	async getSession(id: string): Promise<PipelineSessionRecord | undefined> {
		const row = await this.findSessionRow(id);
		if (!row) return undefined;
		const [identities, progress] = await Promise.all([
			this.loadIdentityIndexes([id]),
			this.loadTopLevelStepProgress([id]),
		]);
		return toSessionRecord(
			row,
			{
				completed: progress.completedBySessionId.get(id) ?? 0,
				skipped: progress.skippedBySessionId.get(id) ?? 0,
			},
			identities.bySessionId.get(id),
			progress.activeBySessionId.get(id) ?? null,
			identities.parkedWorkBySessionId.get(id) ?? 0,
		);
	}

	async listSessions(
		options: {
			cursor?: string;
			limit?: number;
		} = {},
	): Promise<CursorPage<PipelineSessionRecord>> {
		const limit = clampLimit(options.limit);
		const decoded = decodeCursor(options.cursor);
		const where = decoded
			? or(
					lt(pipelineSessions.startedAt, decoded.startedAt),
					and(
						eq(pipelineSessions.startedAt, decoded.startedAt),
						lt(pipelineSessions.id, decoded.id),
					),
				)
			: undefined;
		const rows = await this.db
			.select()
			.from(pipelineSessions)
			.where(where)
			.orderBy(desc(pipelineSessions.startedAt), desc(pipelineSessions.id))
			.limit(limit + 1);
		const hasNext = rows.length > limit;
		const page = rows.slice(0, limit);
		const last = page[page.length - 1];
		const sessionIds = page.map((row) => row.id);
		const [identities, progress] = await Promise.all([
			this.loadIdentityIndexes(sessionIds),
			this.loadTopLevelStepProgress(sessionIds),
		]);
		return {
			items: page.map((row) =>
				toSessionRecord(
					row,
					{
						completed: progress.completedBySessionId.get(row.id) ?? 0,
						skipped: progress.skippedBySessionId.get(row.id) ?? 0,
					},
					identities.bySessionId.get(row.id),
					progress.activeBySessionId.get(row.id) ?? null,
					identities.parkedWorkBySessionId.get(row.id) ?? 0,
				),
			),
			nextCursor:
				hasNext && last ? encodeCursor({ id: last.id, startedAt: last.startedAt }) : null,
		};
	}

	async getReport(id: string): Promise<PipelineSessionReport | undefined> {
		const row = await this.findSessionRow(id);
		if (!row) return undefined;
		const [stepRows, identities, recipeSteps] = await Promise.all([
			this.db
				.select()
				.from(pipelineStepResults)
				.where(eq(pipelineStepResults.sessionId, id))
				.orderBy(pipelineStepResults.displayOrder),
			this.loadIdentityIndexes([id]),
			this.readRecipeSteps(row.recipeId),
		]);
		const progress = indexTopLevelStepProgress(stepRows);
		return {
			recipeSteps,
			session: toSessionRecord(
				row,
				{
					completed: progress.completedBySessionId.get(id) ?? 0,
					skipped: progress.skippedBySessionId.get(id) ?? 0,
				},
				identities.bySessionId.get(id),
				progress.activeBySessionId.get(id) ?? null,
				identities.parkedWorkBySessionId.get(id) ?? 0,
			),
			stepResults: stepRows.map((step) =>
				toStepResultRecord(
					step,
					step.runId === null ? null : (identities.byRunId.get(step.runId) ?? null),
				),
			),
		};
	}

	private async findSessionRow(id: string): Promise<PipelineSessionRow | undefined> {
		return (
			await this.db
				.select()
				.from(pipelineSessions)
				.where(eq(pipelineSessions.id, id))
				.limit(1)
		)[0];
	}

	private async loadIdentityIndexes(sessionIds: string[]): Promise<PipelineIdentityIndexes> {
		if (sessionIds.length === 0)
			return { ...indexExecutionIdentities([]), parkedWorkBySessionId: new Map() };
		const rows = await this.db
			.select({
				backend: runs.backend,
				id: runs.id,
				model: runs.model,
				pipelineSessionId: runs.pipelineSessionId,
				provider: runs.provider,
				reasoningEffort: runs.reasoningEffort,
				summary: runs.summary,
			})
			.from(runs)
			.where(inArray(runs.pipelineSessionId, sessionIds))
			.orderBy(asc(runs.startedAt), asc(runs.id));
		return {
			...indexExecutionIdentities(rows),
			parkedWorkBySessionId: indexParkedWorkRuns(rows),
		};
	}

	private async loadTopLevelStepProgress(sessionIds: string[]): Promise<PipelineProgressIndexes> {
		if (sessionIds.length === 0) return indexTopLevelStepProgress([]);
		const rows = await this.db
			.select()
			.from(pipelineStepResults)
			.where(
				and(
					inArray(pipelineStepResults.sessionId, sessionIds),
					eq(pipelineStepResults.depth, 0),
					isNull(pipelineStepResults.parentStepResultId),
					eq(pipelineStepResults.phase, 'step'),
					inArray(pipelineStepResults.status, [
						'completed',
						'queued',
						'running',
						'skipped',
					]),
				),
			)
			.orderBy(desc(pipelineStepResults.displayOrder));
		return indexTopLevelStepProgress(rows);
	}

	private async readRecipeSteps(recipeId: string): Promise<PipelineSessionReport['recipeSteps']> {
		if (!this.recipeService) return [];
		try {
			const recipe = await this.recipeService.readRecipe(recipeId);
			return recipe.steps;
		} catch {
			// A deleted recipe must not make a persisted session report unreadable.
			return [];
		}
	}
}
