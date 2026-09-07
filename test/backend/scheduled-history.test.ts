import { Database } from 'bun:sqlite';

import { beforeEach, expect, test } from 'bun:test';

import type { DbCommands } from '../../backend/src/db/commands.ts';
import type { WebDatabase } from '../../backend/src/db/client.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { scheduledTaskExecutions, scheduledTasks } from '../../backend/src/db/schema.ts';
import {
	MAX_EXECUTION_PAGE_SIZE,
	ScheduledTaskRepository,
} from '../../backend/src/services/scheduled/repository.ts';

let commands: DbCommands;
let db: WebDatabase;

beforeEach(async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	({ commands, db } = wrapWebDatabase(sqlite));
	await db.insert(scheduledTasks).values({
		createdAt: 1,
		id: 'task-1',
		name: 'Task',
		nextRunAt: 100,
		scheduleExpression: '* * * * *',
		scheduleKind: 'cron',
		state: 'active',
		targetJson: '{"type":"audit","auditAll":true,"auditNames":[],"review":true}',
		targetType: 'audit',
		timezone: 'UTC',
		updatedAt: 1,
	});
	await db.insert(scheduledTaskExecutions).values(
		Array.from({ length: MAX_EXECUTION_PAGE_SIZE + 5 }, (_, index) => ({
			dueAt: index,
			id: `execution-${index}`,
			projectPathsJson: '[]',
			startedAt: index,
			status: 'completed' as const,
			targetJson: '{"type":"audit","auditAll":true,"auditNames":[],"review":true}',
			taskId: 'task-1',
			trigger: 'scheduled' as const,
		})),
	);
});

// The service pages history by asking for one row past the page size; without headroom above
// MAX_EXECUTION_PAGE_SIZE that probe is clamped away and a full page always claims to be the last.
test('history reads keep one row of has-more headroom above the page size', async () => {
	const repository = new ScheduledTaskRepository(db, commands);
	const probe = await repository.executions('task-1', MAX_EXECUTION_PAGE_SIZE + 1, 0);
	expect(probe).toHaveLength(MAX_EXECUTION_PAGE_SIZE + 1);
	expect(await repository.executions('task-1', MAX_EXECUTION_PAGE_SIZE + 50, 0)).toHaveLength(
		MAX_EXECUTION_PAGE_SIZE + 1,
	);
});
