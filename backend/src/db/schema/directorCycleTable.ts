import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	real,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';

import { scheduledTaskExecutions } from './scheduledTables.ts';

export const directorCycles = sqliteTable(
	'director_cycles',
	{
		aiddDirty: integer('aidd_dirty', { mode: 'boolean' }),
		aiddRevision: text('aidd_revision'),
		aiddVersion: text('aidd_version'),
		// One JSON document per cycle: what the auto-launcher started and what it passed over,
		// with a reason each. NULL where the launcher never ran — a failed cycle, an operator's
		// Run cycle, auto-launch switched off, or nothing recorded.
		autoLaunch: text('auto_launch'),
		// The bounds in force when this cycle completed, as JSON. Read back instead of the live
		// Settings so a threshold widened next week cannot start work a historical cycle proposed
		// under a narrower one. NULL where no decision was recorded.
		autoLaunchBounds: text('auto_launch_bounds'),
		// When the current 'processing' claim was taken. A claim older than the staleness window
		// belonged to a process that is gone, and may be taken again; a fresh one may not, which is
		// what makes two concurrent dispatches of one cycle impossible.
		autoLaunchClaimedAt: integer('auto_launch_claimed_at'),
		// The durable half of the auto-launch decision, committed with the cycle's terminal update:
		// 'pending' (a dispatch is owed), 'processing' (one holds it), 'finalized' (decided, and
		// autoLaunch above says what happened), 'disabled' (auto-launch was off at completion).
		// NULL means no decision was recorded — a failed cycle, an operator's Run cycle, or a row
		// written before the column existed.
		autoLaunchState: text('auto_launch_state'),
		completedAt: integer('completed_at'),
		// Human-readable explanation set only when status='failed' (e.g. the backend
		// run's summary such as "Dirty working tree exceeds threshold; skipping run").
		// Null for running/completed cycles. Surfaced in the Recent Cycles UI.
		failureReason: text('failure_reason'),
		fleetHealthScore: real('fleet_health_score'),
		id: text('id').primaryKey(),
		// Who caused the cycle: 'operator' or 'automatic'. Recorded at the start gate rather than
		// inferred from scheduled_task_execution_id at read time, so a future automatic entry point
		// that carries no occurrence cannot quietly report itself as operator-initiated. NULL means
		// not recorded.
		initiator: text('initiator'),
		// Set when a scheduled occurrence started this cycle. The cycle is that occurrence's only
		// child, since the Director's fast path never writes a run row.
		scheduledTaskExecutionId: text('scheduled_task_execution_id'),
		startedAt: integer('started_at').notNull(),
		status: text('status').notNull().default('running'),
		totalSuggestions: integer('total_suggestions').notNull().default(0),
	},
	(table) => [
		index('idx_director_cycles_scheduled_execution_id').on(table.scheduledTaskExecutionId),
		index('idx_director_cycles_started_at').on(sql`${table.startedAt} DESC`),
		foreignKey({
			columns: [table.scheduledTaskExecutionId],
			foreignColumns: [scheduledTaskExecutions.id],
			name: 'fk_director_cycles_scheduled_task_execution_id',
		}).onDelete('set null'),
		check(
			'ck_director_cycles_auto_launch_state',
			sql`${table.autoLaunchState} IS NULL OR ${table.autoLaunchState} IN ('disabled','finalized','pending','processing')`,
		),
		check(
			'ck_director_cycles_auto_launch_json',
			sql`${table.autoLaunch} IS NULL OR json_valid(${table.autoLaunch})`,
		),
		check(
			'ck_director_cycles_auto_launch_bounds_json',
			sql`${table.autoLaunchBounds} IS NULL OR json_valid(${table.autoLaunchBounds})`,
		),
		check(
			'ck_director_cycles_initiator',
			sql`${table.initiator} IS NULL OR ${table.initiator} IN ('automatic','operator')`,
		),
		check(
			'ck_director_cycles_status',
			sql`${table.status} IN ('completed','failed','running')`,
		),
	],
);
