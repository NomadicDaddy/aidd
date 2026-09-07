import { Database } from 'bun:sqlite';
import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'bun:test';

import type { WebContext } from '../../backend/src/context.ts';
import type { ProjectService } from '../../backend/src/services/projectService.ts';
import type { RunService } from '../../backend/src/services/runService.ts';
import type { WebSocketMessage } from '../../backend/src/types.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorCycles, suggestions } from '../../backend/src/db/schema.ts';
import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createDirectorRoutes } from '../../backend/src/routes/director.ts';
import { DirectorSuggestionService } from '../../backend/src/services/director/suggestionService.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';

describe('Director suggestion dismissal route', () => {
	test('transitions pending once and conflicts for every stale or unknown request', async () => {
		const sqlite = new Database(':memory:');
		try {
			sqlite.exec('PRAGMA foreign_keys = ON;');
			migrateWebDatabase(sqlite);
			const { db } = wrapWebDatabase(sqlite);
			const frames: WebSocketMessage[] = [];
			const hub = new WebSocketHub();
			hub.add({
				send: (data) => {
					frames.push(JSON.parse(data) as WebSocketMessage);
				},
			});
			const suggestionService = new DirectorSuggestionService(
				db,
				hub,
				{} as ProjectService,
				{} as RunService,
			);
			const app = new Elysia().use(errorHandlerPlugin).use(
				createDirectorRoutes({
					directorService: suggestionService,
				} as unknown as WebContext),
			);
			const now = Date.now();
			await db.insert(directorCycles).values({
				id: 'cycle_1',
				startedAt: now,
				status: 'completed',
			});
			await db.insert(suggestions).values(
				(['dismissed', 'launched', 'launching', 'pending'] as const).map((status) => ({
					createdAt: now,
					cycleId: 'cycle_1',
					description: `${status} description`,
					id: `suggestion_${status}`,
					projectId: 'aidd',
					reasoning: `${status} reasoning`,
					riskLevel: 'LOW',
					status,
					taskType: 'audit_remediation',
					title: `${status} suggestion`,
				})),
			);

			const dismiss = (id: string) =>
				app.handle(
					new Request(`http://localhost/api/v1/director/suggestions/${id}/dismiss`, {
						method: 'POST',
					}),
				);
			const pendingResponse = await dismiss('suggestion_pending');
			expect(pendingResponse.status).toBe(200);
			expect(await pendingResponse.json()).toEqual({ ok: true });

			for (const id of [
				'suggestion_pending',
				'suggestion_launching',
				'suggestion_launched',
				'suggestion_dismissed',
				'suggestion_unknown',
			]) {
				const response = await dismiss(id);
				expect(response.status).toBe(409);
				expect(await response.json()).toEqual({
					error: `Suggestion is not pending or does not exist: ${id}`,
				});
			}

			expect(frames).toEqual([
				{
					payload: { id: 'suggestion_pending', status: 'dismissed' },
					type: 'suggestion_status',
				},
			]);
			const staleRows = await db
				.select()
				.from(suggestions)
				.where(eq(suggestions.cycleId, 'cycle_1'));
			expect(staleRows.find((row) => row.id === 'suggestion_launching')?.status).toBe(
				'launching',
			);
			expect(staleRows.find((row) => row.id === 'suggestion_launched')?.status).toBe(
				'launched',
			);
			expect(
				staleRows.find((row) => row.id === 'suggestion_dismissed')?.dismissedBy,
			).toBeNull();
		} finally {
			sqlite.close();
		}
	});
});
