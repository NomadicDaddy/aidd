// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./sql.d.ts" />
import init0001 from './0001_baseline.sql' with { type: 'text' };
import init0002 from './0002_director_auto_launch_decision.sql' with { type: 'text' };
import init0003 from './0003_pipeline_step_attempt_identity.sql' with { type: 'text' };
import init0004 from './0004_director_json_constraints.sql' with { type: 'text' };
import init0005 from './0005_run_json_domain_constraints.sql' with { type: 'text' };
import init0006 from './0006_schedule_json_fk_constraints.sql' with { type: 'text' };
import init0007 from './0007_metrics_diary_constraints.sql' with { type: 'text' };
import init0008 from './0008_scheduled_directive_target.sql' with { type: 'text' };
import init0009 from './0009_system_metrics_timestamp_index.sql' with { type: 'text' };
import init0010 from './0010_runs_status_queued.sql' with { type: 'text' };

/**
 * Migration definitions bundled at module load time.
 *
 * Each `.sql` file is imported with `{ type: 'text' }` so Bun statically embeds
 * its CONTENTS (as a string) into the bundle. Add new migrations by importing
 * the SQL file the same way and appending to the `migrations` array — never
 * `readFileSync` a dynamic path, since dynamic reads are not embedded.
 * The runner prepares and executes each statement separately: Bun's multi-statement exec()
 * can swallow runtime constraint failures and must not be used to apply migration scripts.
 *
 * Deliberately no top-level await here: under `bun test --parallel`
 * (`--isolate`), a consumer module could observe this module mid-evaluation and
 * crash with "Cannot access 'migrations' before initialization".
 */

interface MigrationDefinition {
	sql: string;
	version: string;
}

export const migrations: MigrationDefinition[] = [
	{
		sql: init0001,
		version: '0001_baseline',
	},
	{
		sql: init0002,
		version: '0002_director_auto_launch_decision',
	},
	{
		sql: init0003,
		version: '0003_pipeline_step_attempt_identity',
	},
	{
		sql: init0004,
		version: '0004_director_json_constraints',
	},
	{
		sql: init0005,
		version: '0005_run_json_domain_constraints',
	},
	{
		sql: init0006,
		version: '0006_schedule_json_fk_constraints',
	},
	{
		sql: init0007,
		version: '0007_metrics_diary_constraints',
	},
	{
		sql: init0008,
		version: '0008_scheduled_directive_target',
	},
	{
		sql: init0009,
		version: '0009_system_metrics_timestamp_index',
	},
	{
		sql: init0010,
		version: '0010_runs_status_queued',
	},
];
