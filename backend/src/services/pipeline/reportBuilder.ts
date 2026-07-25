import { and, desc, eq, lt, or } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { PipelineSessionRecord, PipelineSessionReport } from '../../types.ts';
import type { RecipeService } from '../recipeService.ts';

import { pipelineSessions, pipelineStepResults } from '../../db/schema.ts';
import { clampLimit, type CursorPage, decodeCursor, encodeCursor } from '../pagination.ts';
import { toSessionRecord, toStepResultRecord } from './helpers.ts';

export class ReportBuilder {
	private readonly db: WebDatabase;
	private readonly recipeService: RecipeService | undefined;

	constructor(db: WebDatabase, recipeService?: RecipeService) {
		this.db = db;
		this.recipeService = recipeService;
	}

	async getSession(id: string): Promise<PipelineSessionRecord | undefined> {
		const row = (
			await this.db
				.select()
				.from(pipelineSessions)
				.where(eq(pipelineSessions.id, id))
				.limit(1)
		)[0];
		return row ? toSessionRecord(row) : undefined;
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
		return {
			items: page.map(toSessionRecord),
			nextCursor:
				hasNext && last ? encodeCursor({ id: last.id, startedAt: last.startedAt }) : null,
		};
	}

	async getReport(id: string): Promise<PipelineSessionReport | undefined> {
		const session = await this.getSession(id);
		if (!session) return undefined;
		const stepRows = await this.db
			.select()
			.from(pipelineStepResults)
			.where(eq(pipelineStepResults.sessionId, id))
			.orderBy(pipelineStepResults.displayOrder);
		// The recipe definition provides the FULL step plan so the report page can show
		// all upcoming steps (not just the ones that have executed so far). Best-effort:
		// a deleted recipe falls back to an empty plan rather than failing the report.
		let recipeSteps: PipelineSessionReport['recipeSteps'] = [];
		if (this.recipeService) {
			try {
				const recipe = await this.recipeService.readRecipe(session.recipeId);
				recipeSteps = recipe.steps;
			} catch {
				recipeSteps = [];
			}
		}
		return {
			recipeSteps,
			session,
			stepResults: stepRows.map(toStepResultRecord),
		};
	}
}
