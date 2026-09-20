import type {
	ScheduledTaskProjectScope,
	ScheduledTaskTarget,
	ScheduledTaskWrite,
} from 'aidd-shared/contracts/scheduled-tasks';

import { persistedReasoningEffortValues } from 'aidd-shared/args/constants';
import { isSafeBackendArg } from 'aidd-shared/backends/safe-arg';
import { normalizeBackendName } from 'aidd-shared/plan/types';

import type { AuditService } from '../auditService.ts';
import type { ProjectService } from '../projectService.ts';
import type { RecipeService } from '../recipeService.ts';
import type { SkillService } from '../skillService.ts';

import { HttpError } from '../errors.ts';
import { resolveParameters } from '../pipeline/helpers.ts';
import { nextOccurrence } from './recurrence.ts';

export class ScheduledTaskValidator {
	private readonly auditService: AuditService;
	private readonly getFleetDir: () => string;
	private readonly projectService: ProjectService;
	private readonly recipeService: RecipeService;
	private readonly skillService: SkillService;

	constructor(
		projectService: ProjectService,
		recipeService: RecipeService,
		skillService: SkillService,
		auditService: AuditService,
		getFleetDir: () => string,
	) {
		this.projectService = projectService;
		this.recipeService = recipeService;
		this.skillService = skillService;
		this.auditService = auditService;
		this.getFleetDir = getFleetDir;
	}

	async resolveWrite(input: ScheduledTaskWrite): Promise<ScheduledTaskWrite> {
		if (!input.name.trim()) throw new HttpError('Task name is required.', 400);
		if (nextOccurrence(input.schedule, Date.now()) === null) {
			throw new HttpError('The schedule must have a future occurrence.', 400);
		}
		const projectScope =
			input.projectScope ?? (input.projects.length === 0 ? 'all' : 'explicit');
		if (projectScope === 'explicit' && input.projects.length === 0) {
			throw new HttpError('Select at least one project, or choose all projects.', 400);
		}
		await this.assertScopeSupportsTarget(projectScope, input.target);
		const projects =
			projectScope === 'explicit' ? await this.resolveDispatchProjects(input.projects) : [];
		await this.validateTarget(input.target, input.confirmUnattendedMutation === true);
		if (input.target.type === 'recipe') {
			const recipe = await this.recipeService.readRecipe(input.target.recipeId);
			for (const projectDir of await this.parameterProbeDirs(projectScope, projects)) {
				resolveParameters({ parameters: input.target.parameters, projectDir, recipe });
			}
		}
		return { ...input, projects, projectScope };
	}

	// A no-project task runs from the applications root, which is a working directory rather than a
	// project, so combinations that only make sense against a project are refused at save time with
	// a sentence instead of at dispatch time with a stack trace.
	private async assertScopeSupportsTarget(
		projectScope: ScheduledTaskProjectScope,
		target: ScheduledTaskTarget,
	): Promise<void> {
		if (target.type === 'director') {
			// A fleet cycle reads every project through the fleet summary and belongs to none of
			// them, so naming projects would describe something the cycle cannot do.
			if (projectScope !== 'none') {
				throw new HttpError(
					'A Director cycle runs across the whole fleet, so it cannot target projects.',
					400,
				);
			}
			return;
		}
		if (projectScope !== 'none') return;
		// Skills and free-form directives are both allowed here. Each becomes a single-iteration
		// directive run in whatever directory it is handed, and an instruction that reads across
		// the fleet — every repository's logs, every repository's recent commits — is exactly the
		// work the applications root exists for. Fanning it out per project would run it N times.
		if (target.type === 'audit') {
			throw new HttpError(
				'Audits run against a project. Choose all projects or select the ones to audit.',
				400,
			);
		}
		if (target.type === 'recipe') {
			// A metadata-only session enforces its .aidd/-only write boundary through git, which the
			// applications root does not provide.
			const recipe = await this.recipeService.readRecipe(target.recipeId);
			if (recipe.metadataOnly === true) {
				throw new HttpError(
					'Metadata-only recipes run against a project. Choose all projects or select the ones to run.',
					400,
				);
			}
		}
	}

	private async parameterProbeDirs(
		projectScope: ScheduledTaskProjectScope,
		projects: string[],
	): Promise<string[]> {
		if (projectScope === 'explicit') return projects;
		if (projectScope === 'none') return [this.getFleetDir()];
		return this.resolveDispatchProjects([]);
	}

	async resolveDispatchProjects(projects: string[]): Promise<string[]> {
		const paths =
			projects.length === 0
				? (await this.projectService.listProjects()).projects.map((project) => project.path)
				: projects;
		return [
			...new Set(
				await Promise.all(
					paths.map((path) => this.projectService.resolveProjectPath(path)),
				),
			),
		];
	}

	async validateTarget(target: ScheduledTaskTarget, confirmed: boolean): Promise<void> {
		// A Director cycle has nothing to validate: it names no catalog entry, takes no launch
		// overrides (the Director profile owns its backend and model), and touches no project tree,
		// so there is no unattended-changes decision for the operator to confirm.
		if (target.type === 'director') return;
		const { backend, model, reasoningEffort } = target.launchTarget ?? {};
		if (backend && !normalizeBackendName(backend)) {
			throw new HttpError(`Invalid backend: ${backend}`, 400);
		}
		if (model && !isSafeBackendArg(model)) {
			throw new HttpError(`Invalid model override: ${model}`, 400);
		}
		if (
			reasoningEffort &&
			!(persistedReasoningEffortValues as readonly string[]).includes(reasoningEffort)
		) {
			throw new HttpError(`Invalid reasoning effort: ${reasoningEffort}`, 400);
		}
		if (target.type === 'skill') {
			await this.skillService.readSkill(target.skillId);
			if (target.executionIntent === 'apply-changes' && !confirmed) {
				throw new HttpError(
					'Confirm unattended changes before saving this skill task.',
					400,
				);
			}
			return;
		}
		if (target.type === 'directive') {
			// The prompt is the whole instruction: there is no catalog entry behind it to fall back
			// on, so an empty one would schedule a run with nothing to do.
			if (!target.prompt.trim()) {
				throw new HttpError('Enter the directive to run.', 400);
			}
			if (target.executionIntent === 'apply-changes' && !confirmed) {
				throw new HttpError(
					'Confirm unattended changes before saving this directive task.',
					400,
				);
			}
			return;
		}
		if (target.type === 'recipe') {
			await this.recipeService.readRecipe(target.recipeId);
			if (!target.applyChanges) {
				throw new HttpError(
					'Scheduled recipes must be marked as allowed to change project files.',
					400,
				);
			}
			if (!confirmed) {
				throw new HttpError(
					'Confirm unattended changes before saving this recipe task.',
					400,
				);
			}
			return;
		}
		if (!target.auditAll && target.auditNames.length === 0) {
			throw new HttpError('Select at least one audit or choose all audits.', 400);
		}
		if (!target.auditAll) {
			await Promise.all(
				target.auditNames.map((name) => this.auditService.readAuditDefinition(name)),
			);
		}
		if (!target.review && !confirmed) {
			throw new HttpError('Confirm unattended changes before saving this audit task.', 400);
		}
	}
}
