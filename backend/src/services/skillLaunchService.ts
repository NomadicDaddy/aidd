import type { RunInitiator } from 'aidd-shared/metadata/active-runs';

import { normalizeBackendName } from 'aidd-shared/plan/types';
import { isSkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import type { PipelineSessionRecord } from '../types/pipeline.ts';
import type { PipelineService } from './pipelineService.ts';
import type { SkillService } from './skillService.ts';

import { HttpError } from './errors.ts';
import { SKILL_RECIPE_PREFIX } from './recipeService.ts';

export interface SkillLaunchInput {
	args?: string;
	backend?: string;
	executionIntent?: string;
	/** Who is starting it. Threaded to the session's runs; never inferred from `source`. */
	initiator: RunInitiator;
	model?: string;
	projectDir: string;
	reasoningEffort?: string;
	scheduledTaskExecutionId?: string;
	skillId: string;
	source?: 'scheduled' | 'web';
}

export class SkillLaunchService {
	private readonly pipelineService: PipelineService;
	private readonly skillService: SkillService;

	constructor(pipelineService: PipelineService, skillService: SkillService) {
		this.pipelineService = pipelineService;
		this.skillService = skillService;
	}

	async launchSkill(input: SkillLaunchInput): Promise<PipelineSessionRecord> {
		if (!isSkillExecutionIntent(input.executionIntent)) {
			throw new HttpError(
				'executionIntent must be either "review-only" or "apply-changes"',
				400,
			);
		}
		const backend = input.backend ? normalizeBackendName(input.backend) : undefined;
		if (input.backend && !backend)
			throw new HttpError(`Invalid backend: ${input.backend}`, 400);
		await this.skillService.readSkill(input.skillId);
		return await this.pipelineService.launchRecipe({
			initiator: input.initiator,
			launchTarget: {
				backend,
				model: input.model,
				reasoningEffort: input.reasoningEffort,
			},
			parameters: {
				args: input.args ?? '',
				backend: backend ?? '',
				executionIntent: input.executionIntent,
				model: input.model ?? '',
			},
			projectDir: input.projectDir,
			recipeId: `${SKILL_RECIPE_PREFIX}${input.skillId}`,
			...(input.scheduledTaskExecutionId
				? { scheduledTaskExecutionId: input.scheduledTaskExecutionId }
				: {}),
			...(input.source ? { source: input.source } : {}),
		});
	}
}
