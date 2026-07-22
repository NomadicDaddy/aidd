import type { Database } from 'bun:sqlite';

export const RETIRED_CATALOG_TYPE = 'ingredient';

export function seedSkillCatalogRows(sqlite: Database): void {
	sqlite.run(
		`INSERT INTO pipeline_sessions (
			id, recipe_id, recipe_name, project_path, project_name, status,
			current_step_index, total_steps, parameters_json, started_at
		) VALUES ('session-1', 'skill:demo', 'Demo', '/project', 'project',
			'completed', 1, 1, '{}', 10)`
	);
	sqlite.run(
		`INSERT INTO pipeline_step_results (
			id, session_id, sequence_number, display_order, depth, step_name,
			step_type, phase, status, started_at, completed_at
		) VALUES ('step-parent', 'session-1', 1, 1, 0, 'Demo',
			'skill', 'step', 'completed', 10, 20)`
	);
	sqlite.run(
		`INSERT INTO pipeline_step_results (
			id, session_id, parent_step_result_id, sequence_number, display_order,
			depth, step_name, step_type, phase, status
		) VALUES ('step-child', 'session-1', 'step-parent', 2, 2, 1, 'Hook',
			'hook', 'post-hook', 'completed')`
	);
	sqlite.run(
		`INSERT INTO invocation_events (
			id, resource_type, resource_id, resource_name, source, session_id,
			project_path, project_name, started_at, completed_at, status
		) VALUES ('event-parent', 'skill', 'demo', 'Demo', 'web', 'session-1',
			'/project', 'project', 10, 20, 'completed')`
	);
	sqlite.run(
		`INSERT INTO invocation_events (
			id, resource_type, resource_id, resource_name, source, session_id,
			parent_invocation_id, parent_resource_type, parent_resource_id,
			project_path, project_name, started_at, completed_at, status
		) VALUES ('event-child', 'run', 'run-1', 'Run', 'recipe-step', 'session-1',
			'event-parent', 'skill', 'demo', '/project', 'project', 11, 19, 'completed')`
	);
}
