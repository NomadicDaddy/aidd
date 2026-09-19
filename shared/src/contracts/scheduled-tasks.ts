import type { LaunchTargetOverrides } from '../plan/launch-target.ts';
import type { SkillExecutionIntent } from '../skill-execution-intent.ts';

export type ScheduledTaskState = 'active' | 'archived' | 'completed' | 'paused';
export type ScheduledExecutionTrigger = 'catch_up' | 'manual' | 'scheduled';

/**
 * How an occurrence decides which projects it runs against.
 *
 * - `all`: every project discovered when the occurrence is claimed. `projects` is empty.
 * - `explicit`: exactly the paths in `projects`, which must not be empty.
 * - `none`: no project at all. Dispatches exactly once, from the applications root, for
 *   fleet-wide work such as the development diary.
 */
export type ScheduledTaskProjectScope = 'all' | 'explicit' | 'none';
export type ScheduledExecutionStatus =
	'completed_with_failures' | 'completed' | 'failed' | 'queued' | 'running' | 'skipped';
export type ScheduledExecutionChildStatus =
	| 'completed_with_failures'
	| 'completed'
	| 'failed'
	| 'killed'
	| 'queued'
	| 'running'
	| 'stopped'
	| 'unknown'
	| 'waiting_approval';

export type ScheduledTaskTarget =
	| {
			applyChanges: boolean;
			launchTarget?: LaunchTargetOverrides;
			parameters?: Record<string, string>;
			recipeId: string;
			type: 'recipe';
	  }
	| {
			args: string;
			executionIntent: SkillExecutionIntent;
			launchTarget?: LaunchTargetOverrides;
			skillId: string;
			type: 'skill';
	  }
	| {
			auditAll: boolean;
			auditNames: string[];
			launchTarget?: LaunchTargetOverrides;
			review: boolean;
			type: 'audit';
	  }
	// A free-form directive, typed by the operator rather than chosen from a catalog. It names no
	// recipe, skill, or audit: the prompt is the whole instruction, and it runs as a single-iteration
	// directive run against each project in scope.
	| {
			executionIntent: SkillExecutionIntent;
			launchTarget?: LaunchTargetOverrides;
			prompt: string;
			type: 'directive';
	  }
	// The Director's fleet cycle. It carries no fields: the backend, model, and prompt all come from
	// the Director profile, and the cycle is fleet-wide by definition so it never names a project.
	// Only the built-in system task uses it; the create form cannot produce one.
	| { type: 'director' };

export type ScheduledTaskSchedule =
	| { expression: string; kind: 'cron'; timezone: string }
	| { kind: 'once'; runAt: string; timezone: string };

export interface ScheduledTask {
	archivedAt: null | number;
	createdAt: number;
	id: string;
	name: string;
	nextRunAt: null | number;
	// Non-empty only when projectScope is 'explicit'.
	projects: string[];
	projectScope: ScheduledTaskProjectScope;
	schedule: ScheduledTaskSchedule;
	state: ScheduledTaskState;
	// Non-null for a built-in task, which can be paused and re-scheduled but never archived.
	systemKey: null | string;
	target: ScheduledTaskTarget;
	updatedAt: number;
}

export interface ScheduledExecutionChild {
	id: string;
	// Null for a 'none' scope occurrence, which runs without a project.
	projectPath: null | string;
	// Snapshotted from the child row on every reconciliation; unknown means the referenced row no
	// longer exists.
	status: ScheduledExecutionChildStatus;
	// A director cycle is its own kind of child: its fast path writes a cycle row and no run row, so
	// an occurrence that launched one has nothing in `runs` or `pipeline_sessions` to derive.
	type: 'cycle' | 'run' | 'session';
}

export interface ScheduledTaskExecution {
	children: ScheduledExecutionChild[];
	completedAt: null | number;
	dispatchErrors: string[];
	dueAt: number;
	id: string;
	projectPaths: string[];
	// Snapshotted with the occurrence. Reading the task's current scope would relabel history the
	// moment the task is edited, and an empty path list means something different under each scope.
	projectScope: ScheduledTaskProjectScope;
	startedAt: number;
	status: ScheduledExecutionStatus;
	target: ScheduledTaskTarget;
	taskId: string;
	trigger: ScheduledExecutionTrigger;
}

export interface ScheduledTaskExecutionPage {
	executions: ScheduledTaskExecution[];
	nextOffset: null | number;
}

export interface ScheduledTaskWrite {
	confirmUnattendedMutation?: boolean;
	name: string;
	// Non-empty only when projectScope is 'explicit'.
	projects: string[];
	// Derived from `projects` when absent, so payloads that omit it stay valid.
	projectScope?: ScheduledTaskProjectScope;
	schedule: ScheduledTaskSchedule;
	target: ScheduledTaskTarget;
}

/**
 * An edit to an existing task.
 *
 * The target is optional here because a built-in task does not expose one to edit: the Director
 * cycle is not a target anybody can name, and an update that omits it keeps whatever the task
 * already runs.
 */
export type ScheduledTaskUpdate = { target?: ScheduledTaskTarget } & Omit<
	ScheduledTaskWrite,
	'target'
>;

export interface ScheduledSchedulePreview {
	next: number[];
}
