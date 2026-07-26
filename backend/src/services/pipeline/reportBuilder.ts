import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type {
	PipelineExecutionIdentity,
	PipelineSessionRecord,
	PipelineSessionReport,
} from '../../types.ts';
import type { RecipeService } from '../recipeService.ts';
import type { PipelineSessionRow } from './types.ts';

import { pipelineSessions, pipelineStepResults, runs } from '../../db/schema.ts';
import { clampLimit, type CursorPage, decodeCursor, encodeCursor } from '../pagination.ts';
import { toSessionRecord, toStepResultRecord } from './recordMappers.ts';

interface PipelineRunIdentityRow extends PipelineExecutionIdentity {
	id: string;
	pipelineSessionId: null | string;
}

interface PipelineIdentityIndexes {
	byRunId: Map<string, PipelineExecutionIdentity>;
	bySessionId: Map<string, PipelineExecutionIdentity[]>;
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
	return { byRunId, bySessionId };
}

export class ReportBuilder {
	private readonly db: WebDatabase;
	private readonly recipeService: RecipeService | undefined;

	constructor(db: WebDatabase, recipeService?: RecipeService) {
		this.db = db;
		this.recipeService = recipeService;
	}

	async getSession(id: string): Promise<PipelineSessionRecord | undefined> {
		const row = await this.findSessionRow(id);
		if (!row) return undefined;
		const identities = await this.loadIdentityIndexes([id]);
		return toSessionRecord(row, identities.bySessionId.get(id));
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
		const identities = await this.loadIdentityIndexes(page.map((row) => row.id));
		return {
			items: page.map((row) => toSessionRecord(row, identities.bySessionId.get(row.id))),
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
		return {
			recipeSteps,
			session: toSessionRecord(row, identities.bySessionId.get(id)),
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
		if (sessionIds.length === 0) return indexExecutionIdentities([]);
		const rows = await this.db
			.select({
				backend: runs.backend,
				id: runs.id,
				model: runs.model,
				pipelineSessionId: runs.pipelineSessionId,
				provider: runs.provider,
				reasoningEffort: runs.reasoningEffort,
			})
			.from(runs)
			.where(inArray(runs.pipelineSessionId, sessionIds))
			.orderBy(asc(runs.startedAt), asc(runs.id));
		return indexExecutionIdentities(rows);
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
