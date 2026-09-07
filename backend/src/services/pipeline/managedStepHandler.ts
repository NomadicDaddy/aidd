import { sha256Json } from 'aidd-shared/content-hash';
import { normalizeBackendName } from 'aidd-shared/plan/types';
import { isSkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import type { RecipeConfigValue, RecipeStepDefinition, RunLaunchRequest } from '../../types.ts';
import type { RunService } from '../runService.ts';
import type { SkillService } from '../skillService.ts';
import type { TelemetryResourceType, TelemetryService } from '../telemetryService.ts';
import type { RunWaiter } from './runWaiter.ts';
import type { ExecutionContext, StepDispatchResult } from './types.ts';

import { SKILL_RECIPE_PREFIX } from '../recipeService.ts';
import { configString, requestFromAiddCliStep, runFailureNarrative } from './helpers.ts';

interface NestedRecord {
	resourceId: string;
	resourceName: string;
	resourceSha256: string;
	resourceType: TelemetryResourceType;
}

// Handles managed step types (aidd-cli, skill): builds a launch request,
// launches the run, and waits for it to reach a terminal state.
export class ManagedStepHandler {
	private readonly skillService: SkillService;
	private readonly runService: RunService;
	private readonly runWaiter: RunWaiter;
	private readonly telemetryService: TelemetryService;

	constructor(input: {
		runService: RunService;
		runWaiter: RunWaiter;
		skillService: SkillService;
		telemetryService: TelemetryService;
	}) {
		this.skillService = input.skillService;
		this.runService = input.runService;
		this.runWaiter = input.runWaiter;
		this.telemetryService = input.telemetryService;
	}

	async handle(
		step: RecipeStepDefinition,
		config: Record<string, RecipeConfigValue>,
		context: ExecutionContext,
		linkRun: (runId: string) => Promise<void>,
	): Promise<StepDispatchResult> {
		let request: RunLaunchRequest;
		let nestedRecord: NestedRecord | undefined;
		let argsValue = '';
		if (step.stepType === 'aidd-cli') {
			request = requestFromAiddCliStep({
				config,
				pipelineSessionId: context.sessionId,
				priorStepOutput: context.priorStepOutput,
				projectDir: context.projectDir,
			});
		} else if (step.stepType === 'skill') {
			const skillId = configString(config, 'skillId');
			if (skillId === undefined) {
				return { errorMessage: 'Skill step is missing skillId', ok: false };
			}
			const executionIntent = configString(config, 'executionIntent');
			if (!isSkillExecutionIntent(executionIntent)) {
				return {
					errorMessage:
						'Skill step must declare executionIntent as "review-only" or "apply-changes"',
					ok: false,
				};
			}
			const skill = await this.skillService.readSkill(skillId);
			argsValue = configString(config, 'args') ?? '';
			// Forward the skill identity (not a pre-compiled prompt) so the CLI is the single
			// place that compiles the directive and stages the skill's contract dependencies
			// (referenced sibling skills / audit docs) into the project's `.aidd/`. Without this,
			// a sandboxed agent cannot read a `<aidd-root>/...` contract reference that lives
			// outside the project directory.
			request = {
				maxIterations: 1,
				mode: 'directive',
				...(executionIntent === 'review-only' ? { directiveReadonly: true } : {}),
				pipelineSessionId: context.sessionId,
				projectDir: context.projectDir,
				skillId,
			};
			if (argsValue.length > 0) request.skillArgs = argsValue;
			const backendValue = configString(config, 'backend');
			const backend = backendValue ? normalizeBackendName(backendValue) : undefined;
			if (backend) request.backend = backend;
			const model = configString(config, 'model');
			if (model !== undefined) request.model = model;
			nestedRecord = {
				resourceId: skillId,
				resourceName: skill.title || skillId,
				resourceSha256: skill.definitionSha256,
				resourceType: 'skill',
			};
		} else {
			return { errorMessage: `Unsupported managed step type: ${step.stepType}`, ok: false };
		}
		// Session-level launch override wins over per-step config: the backend/model chosen
		// visibly at launch time must not be silently beaten by buried step config. Unset
		// fields keep the step's own config, then project/global defaults.
		if (context.launchTarget?.backend !== undefined) {
			request.backend = context.launchTarget.backend;
		}
		if (context.launchTarget?.model !== undefined) request.model = context.launchTarget.model;
		if (context.launchTarget?.reasoningEffort !== undefined) {
			request.reasoningEffort = context.launchTarget.reasoningEffort;
		}
		// Metadata-only sessions get the CLI-enforced write boundary on every managed
		// run, including those launched by nested recipe-ref children (context is
		// inherited) and triumvirate steps (the CLI enforces the allowlist against the
		// execution stage; planning stages run in scratch mirrors). The reverting
		// pipeline backstop in stepRunner still applies on top.
		if (context.metadataOnly === true) {
			request.writeAllowlist = ['.aidd'];
		}
		request.driver = {
			driverId: step.id,
			driverKind: 'recipe-step',
			driverSha256: sha256Json(step),
		};
		const run = await this.runService.launchRun(request, {
			initiator: context.initiator,
			...(context.scheduledTaskExecutionId
				? { scheduledTaskExecutionId: context.scheduledTaskExecutionId }
				: {}),
			source: context.source ?? 'web',
		});
		// Persist the step-to-run relationship before waiting. Detached managed runs can
		// survive a web restart, so delaying this write until the run finishes leaves a
		// restart window where the pipeline cannot find its live or completed child.
		await linkRun(run.id);
		if (nestedRecord !== undefined) {
			// A synthetic `skill:<id>` session is a direct one-shot launch: the
			// wrapper recipe records no telemetry of its own, so the skill
			// invocation is recorded as a top-level 'web' event without recipe parentage.
			const syntheticOneShot = context.lineage[0]?.startsWith(SKILL_RECIPE_PREFIX) ?? false;
			const parentResourceId = context.lineage[0];
			await this.telemetryService.recordStart({
				argsPresent: argsValue.length > 0,
				backend: run.backend,
				model: run.model,
				...(syntheticOneShot
					? {}
					: {
							parentInvocationId: context.invocationId,
							parentResourceId,
							parentResourceType: 'recipe' as const,
						}),
				projectName: run.projectName,
				projectPath: run.projectPath,
				resourceId: nestedRecord.resourceId,
				resourceName: nestedRecord.resourceName,
				resourceSha256: nestedRecord.resourceSha256,
				resourceType: nestedRecord.resourceType,
				runId: run.id,
				sessionId: context.sessionId,
				source: syntheticOneShot ? (context.source ?? 'web') : 'recipe-step',
				startedAt: run.startedAt,
			});
		}
		const completed = await this.runWaiter.waitForRun(run.id, context.sessionId);
		return {
			agentMessage: await this.runWaiter.agentMessageForRun(run.id),
			errorMessage:
				completed.status === 'completed' ? undefined : runFailureNarrative(completed),
			exitCode: completed.exitCode ?? undefined,
			ok: completed.status === 'completed',
			outputSummary: await this.runWaiter.outputForRun(run.id),
		};
	}
}
