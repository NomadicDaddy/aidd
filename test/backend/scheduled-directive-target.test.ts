import { Database } from 'bun:sqlite';

import { beforeEach, expect, test } from 'bun:test';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { ScheduledTaskRepository } from '../../backend/src/services/scheduled/repository.ts';

let repository: ScheduledTaskRepository;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	repository = new ScheduledTaskRepository(wrapped.db, wrapped.commands);
});

// The target_type CHECK constraint is the reason this goes through a migrated database rather than
// a stub: a contract that admits 'directive' while the table refuses it fails only at save time.
test('a directive task round-trips through the migrated schema with its prompt intact', async () => {
	const task = await repository.write(
		'scheduled_task_directive',
		{
			name: 'Nightly sweep',
			projects: ['D:/project'],
			projectScope: 'explicit',
			schedule: { expression: '0 9 * * *', kind: 'cron', timezone: 'UTC' },
			target: {
				executionIntent: 'apply-changes',
				launchTarget: { backend: 'codex' },
				prompt: 'Fix the failing lint rules.',
				type: 'directive',
			},
		},
		Date.UTC(2026, 0, 1),
	);

	expect(task.target).toEqual({
		executionIntent: 'apply-changes',
		launchTarget: { backend: 'codex' },
		prompt: 'Fix the failing lint rules.',
		type: 'directive',
	});
	expect((await repository.get('scheduled_task_directive'))?.target.type).toBe('directive');
});
