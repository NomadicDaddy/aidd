import type {
	ScheduledSchedulePreview,
	ScheduledTask,
	ScheduledTaskExecution,
	ScheduledTaskExecutionPage,
	ScheduledTaskSchedule,
	ScheduledTaskState,
	ScheduledTaskUpdate,
	ScheduledTaskWrite,
} from 'aidd-shared/contracts/scheduled-tasks';

import type { WebDatabaseHandle } from '../db/client.ts';
import type { AuditService } from './auditService.ts';
import type { PipelineService } from './pipelineService.ts';
import type { ProjectService } from './projectService.ts';
import type { RecipeService } from './recipeService.ts';
import type { SkillLaunchService } from './skillLaunchService.ts';
import type { SkillService } from './skillService.ts';

import { HttpError } from './errors.ts';
import { type DirectorCycleLauncher, ScheduledTaskDispatcher } from './scheduled/dispatch.ts';
import { nextOccurrence, previewSchedule } from './scheduled/recurrence.ts';
import { MAX_EXECUTION_PAGE_SIZE, ScheduledTaskRepository } from './scheduled/repository.ts';
import { ScheduledTaskRuntime } from './scheduled/runtime.ts';
import { type DirectorScheduleSeed, ensureDirectorScheduledTask } from './scheduled/systemTasks.ts';
import { ScheduledTaskValidator } from './scheduled/validator.ts';

export class ScheduledTaskService {
	private readonly dispatcher: ScheduledTaskDispatcher;
	private readonly repository: ScheduledTaskRepository;
	private readonly runtime: ScheduledTaskRuntime;
	private readonly validator: ScheduledTaskValidator;

	constructor(
		database: WebDatabaseHandle,
		projectService: ProjectService,
		recipeService: RecipeService,
		skillService: SkillService,
		auditService: AuditService,
		pipelineService: PipelineService,
		skillLaunchService: SkillLaunchService,
	) {
		// A task with no project still needs a working directory. The applications root is the one
		// directory that is always allowed and always contains the fleet, which is exactly the scope
		// fleet-wide work reads and writes.
		const getFleetDir = (): string => {
			const root = projectService.getAllowedRoots()[0];
			if (!root) throw new HttpError('No applications root is configured.', 500);
			return root;
		};
		this.repository = new ScheduledTaskRepository(database.db, database.commands);
		this.validator = new ScheduledTaskValidator(
			projectService,
			recipeService,
			skillService,
			auditService,
			getFleetDir,
		);
		this.dispatcher = new ScheduledTaskDispatcher(
			auditService,
			pipelineService,
			skillLaunchService,
			getFleetDir,
		);
		this.runtime = new ScheduledTaskRuntime(
			database,
			this.dispatcher,
			this.repository,
			this.validator,
		);
	}

	// Set at boot rather than injected: the Director is built after the scheduling services, and
	// only the built-in Director task ever reaches this.
	setDirectorCycleLauncher(launcher: DirectorCycleLauncher): void {
		this.dispatcher.setDirectorCycleLauncher(launcher);
	}

	ensureDirectorTask(seed: DirectorScheduleSeed): Promise<ScheduledTask> {
		return ensureDirectorScheduledTask(this.repository, seed);
	}

	start(): void {
		this.runtime.start();
	}

	dispose(): void {
		this.runtime.dispose();
	}

	list(states?: ScheduledTaskState[]): Promise<ScheduledTask[]> {
		return this.repository.list(states);
	}

	async detail(id: string): Promise<ScheduledTask> {
		const task = await this.repository.get(id);
		if (!task) throw new HttpError('Scheduled task not found.', 404);
		return task;
	}

	preview(schedule: ScheduledTaskSchedule): ScheduledSchedulePreview {
		return previewSchedule(schedule);
	}

	create(input: ScheduledTaskWrite): Promise<ScheduledTask> {
		// There is one Director cycle and the panel seeds it. The HTTP layer does not accept the
		// variant at all; this covers internal callers.
		if (input.target.type === 'director') {
			throw new HttpError('The Director cycle is built in and cannot be created.', 400);
		}
		return this.save(`scheduled_task_${crypto.randomUUID()}`, input);
	}

	async update(id: string, input: ScheduledTaskUpdate): Promise<ScheduledTask> {
		const task = await this.detail(id);
		if (task.state === 'archived') throw new HttpError('Archived tasks cannot be edited.', 409);
		// A built-in task is editable only where editing means something. Name, cadence, and timezone
		// are the operator's; what it runs and what it runs against are fixed, so they are taken from
		// the stored row rather than from the request.
		if (task.systemKey !== null) {
			return this.save(id, {
				...input,
				projects: [],
				projectScope: 'none',
				target: task.target,
			});
		}
		return this.save(id, { ...input, target: input.target ?? task.target });
	}

	async executions(id: string, limit = 20, offset = 0): Promise<ScheduledTaskExecutionPage> {
		await this.detail(id);
		const pageSize = Math.min(Math.max(limit, 1), MAX_EXECUTION_PAGE_SIZE);
		const executions = await this.repository.executions(id, pageSize + 1, offset);
		return {
			executions: executions.slice(0, pageSize),
			nextOffset: executions.length > pageSize ? offset + pageSize : null,
		};
	}

	async pause(id: string): Promise<void> {
		const task = await this.detail(id);
		if (task.state === 'archived') throw new HttpError('Archived tasks cannot be paused.', 409);
		await this.repository.setState(id, 'paused', null, Date.now());
		this.runtime.wake();
	}

	async resume(id: string): Promise<void> {
		const task = await this.detail(id);
		if (task.state === 'archived')
			throw new HttpError('Archived tasks cannot be resumed.', 409);
		const nextRunAt = nextOccurrence(task.schedule, Date.now());
		if (nextRunAt === null) {
			throw new HttpError(
				'This task has no future occurrence. Edit its schedule before resuming.',
				409,
			);
		}
		await this.repository.setState(id, 'active', nextRunAt, Date.now());
		this.runtime.wake();
	}

	async archive(id: string): Promise<void> {
		const task = await this.detail(id);
		if (task.systemKey !== null) {
			throw new HttpError('Built-in tasks cannot be archived. Pause it instead.', 409);
		}
		if (await this.repository.hasActiveExecution(id)) {
			throw new HttpError('A task with an active execution cannot be archived.', 409);
		}
		await this.repository.setState(id, 'archived', null, Date.now());
		this.runtime.wake();
	}

	async runNow(id: string): Promise<ScheduledTaskExecution> {
		const task = await this.detail(id);
		if (task.state === 'archived') throw new HttpError('Archived tasks cannot run.', 409);
		await this.validator.validateTarget(task.target, true);
		await this.runtime.runNow(task);
		const execution = (await this.repository.executions(id, 1))[0];
		if (!execution) throw new Error('Scheduled execution was not recorded.');
		return execution;
	}

	referencesProject(projectPath: string): Promise<boolean> {
		return this.repository.referencesProject(projectPath);
	}

	referencesTarget(type: 'recipe' | 'skill', id: string): Promise<boolean> {
		return this.repository.referencesTarget(type, id);
	}

	private async save(id: string, input: ScheduledTaskWrite): Promise<ScheduledTask> {
		const resolved = await this.validator.resolveWrite(input);
		const task = await this.repository.write(id, resolved, Date.now());
		this.runtime.wake();
		return task;
	}
}
