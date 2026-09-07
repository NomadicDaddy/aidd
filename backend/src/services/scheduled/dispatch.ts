import type {
	ScheduledExecutionChild,
	ScheduledExecutionTrigger,
	ScheduledTaskProjectScope,
	ScheduledTaskTarget,
} from 'aidd-shared/contracts/scheduled-tasks';
import type { RunInitiator } from 'aidd-shared/metadata/active-runs';

import type { AuditService } from '../auditService.ts';
import type { PipelineService } from '../pipelineService.ts';
import type { SkillLaunchService } from '../skillLaunchService.ts';

import { webLogger } from '../../logger.ts';

export interface ScheduledDispatchResult {
	children: ScheduledExecutionChild[];
	errors: string[];
	// Set when the occurrence deliberately started nothing, so it is recorded as skipped rather
	// than as a failure that happened to produce no children.
	skipped?: string;
}

export interface ScheduledDispatchInput {
	executionId: string;
	projectPaths: string[];
	scope: ScheduledTaskProjectScope;
	target: ScheduledTaskTarget;
	/**
	 * What started this occurrence, used to record launch provenance.
	 *
	 * Required rather than defaulted so every dispatch site records who asked. A default would
	 * silently misclassify future launch paths.
	 */
	trigger: ScheduledExecutionTrigger;
}

/**
 * Who started this occurrence, in the vocabulary the rest of aidd records.
 *
 * Run now is a person standing in front of the task pressing the button, so every run, session,
 * and cycle it starts is filed as that person's work. Timer and catch-up occurrences are automatic.
 *
 * @param trigger What claimed the occurrence.
 * @returns 'operator' for Run now, 'automatic' for anything the timer started.
 */
export function occurrenceInitiator(trigger: ScheduledExecutionTrigger): RunInitiator {
	return trigger === 'manual' ? 'operator' : 'automatic';
}

// Where a launch runs, and the path the occurrence records for it. They differ only for a
// no-project task, which runs from the applications root but records no project at all.
interface DispatchSite {
	launchDir: string;
	recordedPath: null | string;
}

/**
 * Starts the Director's fleet cycle for a due occurrence.
 *
 * A cycle is not launched like the other targets: it has its own working directory, its own
 * profile-owned backend, and its own overlap rule, so the Director service starts it and this
 * dispatcher only records what came back. A busy fleet answers with a reason instead of an id.
 */
export type DirectorCycleLauncher = (
	scheduledTaskExecutionId: string,
	initiator: RunInitiator,
) => Promise<{ cycleId: string } | { skipped: string }>;

export class ScheduledTaskDispatcher {
	private readonly auditService: AuditService;
	// Set after construction: the Director service does not exist yet when the scheduling services
	// are built, and only the built-in system task ever needs it.
	private launchDirectorCycle: DirectorCycleLauncher | null = null;
	private readonly getFleetDir: () => string;
	private readonly pipelineService: PipelineService;
	private readonly skillLaunchService: SkillLaunchService;

	constructor(
		auditService: AuditService,
		pipelineService: PipelineService,
		skillLaunchService: SkillLaunchService,
		getFleetDir: () => string,
	) {
		this.auditService = auditService;
		this.getFleetDir = getFleetDir;
		this.pipelineService = pipelineService;
		this.skillLaunchService = skillLaunchService;
	}

	setDirectorCycleLauncher(launcher: DirectorCycleLauncher): void {
		this.launchDirectorCycle = launcher;
	}

	async dispatch(input: ScheduledDispatchInput): Promise<ScheduledDispatchResult> {
		// Thread one trigger-derived initiator through every launch so the schedule history, runs,
		// sessions, and Director cycles all agree about whether a person or aidd started the work.
		const initiator = occurrenceInitiator(input.trigger);
		if (input.target.type === 'director') {
			return this.dispatchDirectorCycle(input.executionId, initiator);
		}
		return this.dispatchSites(input.executionId, input.target, this.sitesFor(input), initiator);
	}

	// The cycle is the occurrence's only child. The fallback CLI run a cycle may start underneath is
	// deliberately not recorded here: its outcome is already folded into the cycle, and counting both
	// would let the execution finalize while the cycle was still persisting its result.
	private async dispatchDirectorCycle(
		executionId: string,
		initiator: RunInitiator,
	): Promise<ScheduledDispatchResult> {
		if (!this.launchDirectorCycle) {
			return {
				children: [],
				errors: ['The Director is unavailable, so no cycle was started.'],
			};
		}
		try {
			const started = await this.launchDirectorCycle(executionId, initiator);
			if ('skipped' in started) return { children: [], errors: [], skipped: started.skipped };
			return {
				children: [
					{ id: started.cycleId, projectPath: null, status: 'running', type: 'cycle' },
				],
				errors: [],
			};
		} catch (err) {
			return { children: [], errors: [err instanceof Error ? err.message : String(err)] };
		}
	}

	// A task with no project runs exactly once, from the applications root. Fleet-wide work such as
	// the development diary reads every repository under that root and writes beside them, so
	// fanning it out per project would produce one duplicate entry per repository.
	private sitesFor(input: ScheduledDispatchInput): DispatchSite[] {
		if (input.scope !== 'none') {
			return input.projectPaths.map((path) => ({ launchDir: path, recordedPath: path }));
		}
		const fleetDir = this.getFleetDir();
		webLogger.info(
			{ executionId: input.executionId, fleetDir, target: input.target.type },
			'Dispatching a scheduled occurrence with no project',
		);
		return [{ launchDir: fleetDir, recordedPath: null }];
	}

	private async dispatchSites(
		executionId: string,
		target: ScheduledTaskTarget,
		sites: DispatchSite[],
		initiator: RunInitiator,
	): Promise<ScheduledDispatchResult> {
		const children: ScheduledExecutionChild[] = [];
		const errors: string[] = [];
		for (const { launchDir, recordedPath } of sites) {
			try {
				if (target.type === 'recipe') {
					const session = await this.pipelineService.launchRecipe({
						initiator,
						launchTarget: target.launchTarget,
						parameters: target.parameters,
						projectDir: launchDir,
						recipeId: target.recipeId,
						scheduledTaskExecutionId: executionId,
						source: 'scheduled',
					});
					children.push({
						id: session.id,
						projectPath: recordedPath,
						status: session.status,
						type: 'session',
					});
				} else if (target.type === 'skill') {
					const session = await this.skillLaunchService.launchSkill({
						args: target.args,
						...(target.launchTarget?.backend
							? { backend: target.launchTarget.backend }
							: {}),
						executionIntent: target.executionIntent,
						initiator,
						...(target.launchTarget?.model ? { model: target.launchTarget.model } : {}),
						projectDir: launchDir,
						...(target.launchTarget?.reasoningEffort
							? { reasoningEffort: target.launchTarget.reasoningEffort }
							: {}),
						scheduledTaskExecutionId: executionId,
						skillId: target.skillId,
						source: 'scheduled',
					});
					children.push({
						id: session.id,
						projectPath: recordedPath,
						status: session.status,
						type: 'session',
					});
				} else if (target.type === 'audit') {
					const result = await this.auditService.launchAuditsForPaths({
						auditAll: target.auditAll,
						auditNames: target.auditNames,
						...(target.launchTarget?.backend
							? { backend: target.launchTarget.backend }
							: {}),
						initiator,
						...(target.launchTarget?.model ? { model: target.launchTarget.model } : {}),
						projectPaths: [launchDir],
						...(target.launchTarget?.reasoningEffort
							? { reasoningEffort: target.launchTarget.reasoningEffort }
							: {}),
						review: target.review,
						scheduledTaskExecutionId: executionId,
						source: 'scheduled',
					});
					children.push(
						...result.runIds.map((id) => ({
							id,
							projectPath: recordedPath,
							status: 'running' as const,
							type: 'run' as const,
						})),
					);
					if (result.failures.length > 0) errors.push(...result.failures);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				errors.push(recordedPath === null ? message : `${recordedPath}: ${message}`);
			}
		}
		return { children, errors };
	}
}
