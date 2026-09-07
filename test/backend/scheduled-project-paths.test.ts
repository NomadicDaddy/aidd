import { Database } from 'bun:sqlite';

import { expect, test } from 'bun:test';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import {
	invocationEvents,
	pipelineSessions,
	runs,
	scheduledTaskProjects,
	scheduledTasks,
} from '../../backend/src/db/schema.ts';
import { ScheduledTaskRepository } from '../../backend/src/services/scheduled/repository.ts';

test('project moves update history and current scheduled task references together', async () => {
	const sqlite = new Database(':memory:');
	try {
		migrateWebDatabase(sqlite);
		const { commands, db } = wrapWebDatabase(sqlite);
		await db.insert(pipelineSessions).values({
			id: 'session',
			parametersJson: '{}',
			projectName: 'old',
			projectPath: 'D:/old',
			recipeId: 'recipe',
			recipeName: 'Recipe',
			startedAt: 1,
			totalSteps: 1,
		});
		await db.insert(runs).values({
			backend: 'codex',
			id: 'run',
			pipelineSessionId: 'session',
			projectName: 'old',
			projectPath: 'D:/old',
			startedAt: 1,
		});
		await db.insert(invocationEvents).values({
			id: 'event',
			projectName: 'old',
			projectPath: 'D:/old',
			resourceId: 'run',
			resourceName: 'Run',
			resourceType: 'run',
			runId: 'run',
			source: 'web',
			startedAt: 1,
		});
		await db.insert(scheduledTasks).values({
			createdAt: 1,
			id: 'task',
			name: 'Task',
			nextRunAt: 10,
			scheduleExpression: '* * * * *',
			scheduleKind: 'cron',
			targetJson: '{"type":"recipe","recipeId":"recipe","applyChanges":false}',
			targetType: 'recipe',
			timezone: 'UTC',
			updatedAt: 1,
		});
		await db.insert(scheduledTaskProjects).values({ projectPath: 'D:/old', taskId: 'task' });

		await commands.updateProjectPathReferences({
			destinationPath: 'D:/new',
			projectName: 'new',
			sourcePath: 'D:/old',
		});

		expect((await db.select().from(runs))[0]?.projectPath).toBe('D:/new');
		expect((await db.select().from(pipelineSessions))[0]?.projectPath).toBe('D:/new');
		expect((await db.select().from(invocationEvents))[0]?.projectPath).toBe('D:/new');
		expect((await db.select().from(scheduledTaskProjects))[0]?.projectPath).toBe('D:/new');
	} finally {
		sqlite.close();
	}
});

test('only non-archived tasks block project and catalog deletion', async () => {
	const sqlite = new Database(':memory:');
	try {
		migrateWebDatabase(sqlite);
		const { commands, db } = wrapWebDatabase(sqlite);
		await db.insert(scheduledTasks).values([
			{
				createdAt: 1,
				id: 'all-projects',
				name: 'All projects',
				nextRunAt: 10,
				scheduleExpression: '* * * * *',
				scheduleKind: 'cron',
				targetJson:
					'{"type":"skill","skillId":"all","args":"","executionIntent":"review-only"}',
				targetType: 'skill',
				timezone: 'UTC',
				updatedAt: 1,
			},
			{
				createdAt: 1,
				id: 'active-recipe',
				name: 'Active recipe',
				nextRunAt: 10,
				scheduleExpression: '* * * * *',
				scheduleKind: 'cron',
				targetJson: '{"type":"recipe","recipeId":"recipe","applyChanges":false}',
				targetType: 'recipe',
				timezone: 'UTC',
				updatedAt: 1,
			},
			{
				createdAt: 1,
				id: 'paused-recipe',
				name: 'Paused recipe',
				nextRunAt: null,
				scheduleExpression: '* * * * *',
				scheduleKind: 'cron',
				state: 'paused',
				targetJson: '{"type":"recipe","recipeId":"paused","applyChanges":true}',
				targetType: 'recipe',
				timezone: 'UTC',
				updatedAt: 1,
			},
			{
				archivedAt: 2,
				createdAt: 1,
				id: 'archived-skill',
				name: 'Archived skill',
				nextRunAt: null,
				scheduleExpression: '* * * * *',
				scheduleKind: 'cron',
				state: 'archived',
				targetJson:
					'{"type":"skill","skillId":"skill","args":"","executionIntent":"review-only"}',
				targetType: 'skill',
				timezone: 'UTC',
				updatedAt: 2,
			},
		]);
		await db
			.insert(scheduledTaskProjects)
			.values({ projectPath: 'D:/project', taskId: 'active-recipe' });
		const repository = new ScheduledTaskRepository(db, commands);

		expect(await repository.referencesProject('D:/project')).toBe(true);
		// The all-project task resolves its projects per occurrence, so it pins none of them.
		expect(await repository.referencesProject('D:/otherwise-unlisted')).toBe(false);
		expect(await repository.referencesTarget('recipe', 'recipe')).toBe(true);
		expect(await repository.referencesTarget('skill', 'skill')).toBe(false);
		const updated = await repository.write(
			'paused-recipe',
			{
				confirmUnattendedMutation: true,
				name: 'Still paused',
				projects: ['D:/new-project'],
				schedule: { expression: '0 10 * * *', kind: 'cron', timezone: 'UTC' },
				target: { applyChanges: true, recipeId: 'paused', type: 'recipe' },
			},
			Date.now(),
		);
		expect(updated).toMatchObject({
			name: 'Still paused',
			nextRunAt: null,
			projects: ['D:/new-project'],
			state: 'paused',
		});
	} finally {
		sqlite.close();
	}
});
