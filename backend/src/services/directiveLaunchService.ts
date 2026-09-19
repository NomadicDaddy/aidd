import type { RunInitiator } from 'aidd-shared/metadata/active-runs';
import type { BackendInputName } from 'aidd-shared/plan/types';
import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import type { RunService } from './runService.ts';
import type { TelemetryService } from './telemetryService.ts';

import { HttpError } from './errors.ts';

export interface DirectiveLaunchInput {
	backend?: BackendInputName;
	executionIntent: SkillExecutionIntent;
	/** Who is starting it. Threaded to the run; never inferred from `source`. */
	initiator: RunInitiator;
	model?: string;
	projectDir: string;
	prompt: string;
	reasoningEffort?: string;
	scheduledTaskExecutionId?: string;
	source?: 'scheduled' | 'web';
}

/**
 * The one place a free-form directive becomes a run.
 *
 * Both entry points go through here — the operator's launch modal and a scheduled directive task —
 * so a directive started by the timer is shaped, capped, and recorded exactly like one a person
 * typed, instead of drifting apart as a second copy of the same launch.
 */
export class DirectiveLaunchService {
	private readonly runService: RunService;
	private readonly telemetryService: TelemetryService;

	constructor(runService: RunService, telemetryService: TelemetryService) {
		this.runService = runService;
		this.telemetryService = telemetryService;
	}

	async launchDirective(
		input: DirectiveLaunchInput,
	): Promise<Awaited<ReturnType<RunService['launchRun']>>> {
		const prompt = input.prompt.trim();
		if (!prompt) throw new HttpError('Directive prompt is required', 400);
		const run = await this.runService.launchRun(
			{
				...(input.backend !== undefined ? { backend: input.backend } : {}),
				directiveReadonly: input.executionIntent === 'review-only',
				// A directive is one instruction, not a backlog to work through.
				maxIterations: 1,
				mode: 'directive',
				...(input.model !== undefined ? { model: input.model } : {}),
				projectDir: input.projectDir,
				prompt,
				...(input.reasoningEffort !== undefined
					? { reasoningEffort: input.reasoningEffort }
					: {}),
			},
			{
				initiator: input.initiator,
				...(input.scheduledTaskExecutionId
					? { scheduledTaskExecutionId: input.scheduledTaskExecutionId }
					: {}),
				...(input.source ? { source: input.source } : {}),
			},
		);
		await this.telemetryService.recordStart({
			backend: run.backend,
			model: run.model,
			projectName: run.projectName,
			projectPath: run.projectPath,
			resourceId: run.id,
			resourceName: `directive · ${run.projectName}`,
			resourceType: 'run',
			runId: run.id,
			source: input.source ?? 'web',
			startedAt: run.startedAt,
		});
		return run;
	}
}
