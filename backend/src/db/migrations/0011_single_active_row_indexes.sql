-- One running director cycle, and one active execution per scheduled task, held by the
-- database itself. Both rules were enforced only by a select-then-insert inside a command
-- transaction, so any writer that bypassed the command (a raw SQL repair, a future caller)
-- could stack a second cycle or a second occurrence over the first.

-- Any duplicates already on disk would make the indexes fail to build, so demote them first,
-- keeping the most recently started row of each group. Every value written here is one the
-- tables' CHECK constraints already allow.
UPDATE director_cycles
SET status = 'failed',
	completed_at = started_at,
	failure_reason = 'Demoted by migration 0011_single_active_row_indexes: a later cycle was already running.'
WHERE status = 'running'
	AND id <> (
		SELECT id FROM director_cycles
		WHERE status = 'running'
		ORDER BY started_at DESC, id DESC
		LIMIT 1
	);

UPDATE scheduled_task_executions
SET status = 'failed',
	completed_at = started_at
WHERE status IN ('queued', 'running')
	AND id <> (
		SELECT newest.id FROM scheduled_task_executions AS newest
		WHERE newest.task_id = scheduled_task_executions.task_id
			AND newest.status IN ('queued', 'running')
		ORDER BY newest.started_at DESC, newest.id DESC
		LIMIT 1
	);

CREATE UNIQUE INDEX uq_director_cycles_running
	ON director_cycles(status)
	WHERE status = 'running';

CREATE UNIQUE INDEX uq_scheduled_task_executions_active_task
	ON scheduled_task_executions(task_id)
	WHERE status IN ('queued', 'running');
