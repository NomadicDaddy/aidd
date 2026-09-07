import { sha256Json } from 'aidd-shared/content-hash';
import { asRunInitiator } from 'aidd-shared/metadata/active-runs';
import { isGitRepository } from 'aidd-shared/pipeline/writeAllowlist';
import { basename } from 'node:path';

import type { WebDatabase } from '../../db/client.ts';
import type { PipelineSessionRecord, RecipeDefinition } from '../../types.ts';
import type { AppWatchdog } from '../appLauncher/watchdog.ts';
import type { ProjectService } from '../projectService.ts';
import type { RecipeService } from '../recipeService.ts';
import type { TelemetryService } from '../telemetryService.ts';
import type { BroadcastService } from './broadcastService.ts';
import type { ReportBuilder } from './reportBuilder.ts';
import type { SessionLifecycle } from './sessionLifecycle.ts';
import type { StepExecutor } from './stepExecutor.ts';
import type {
	ExecutionContext,
	LaunchPipelineInput,
	PipelineSessionRow,
	ResumeResolution,
} from './types.ts';

import { pipelineSessions } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { canonicalProjectPath } from '../../paths.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { SKILL_RECIPE_PREFIX } from '../recipeService.ts';
import { createPipelineSessionId, parseSessionParameters, resolveParameters } from './helpers.ts';
import { launchTargetFromSessionRow, normalizeLaunchTarget } from './launchTarget.ts';
import { PipelineSessionExecutor } from './sessionExecutor.ts';

export class LaunchService {
	private readonly db: WebDatabase;
	private readonly projectService: ProjectService;
	private readonly recipeService: RecipeService;
	private readonly report: ReportBuilder;
	private readonly sessionExecutor: PipelineSessionExecutor;
	private readonly telemetryService: TelemetryService;
	private readonly activeExecutions: Map<string, Promise<void>>;
	private readonly appWatchdog: AppWatchdog | undefined;

	constructor(input: {
		activeExecutions: Map<string, Promise<void>>;
		appWatchdog?: AppWatchdog;
		broadcast: BroadcastService;
		db: WebDatabase;
		lifecycle: SessionLifecycle;
		projectService: ProjectService;
		recipeService: RecipeService;
		report: ReportBuilder;
		stepExecutor: StepExecutor;
		stopFlags: Set<string>;
		telemetryService: TelemetryService;
	}) {
		this.db = input.db;
		this.projectService = input.projectService;
		this.recipeService = input.recipeService;
		this.report = input.report;
		this.sessionExecutor = new PipelineSessionExecutor({
			broadcast: input.broadcast,
			db: input.db,
			lifecycle: input.lifecycle,
			report: input.report,
			stepExecutor: input.stepExecutor,
			stopFlags: input.stopFlags,
		});
		this.telemetryService = input.telemetryService;
		this.activeExecutions = input.activeExecutions;
		this.appWatchdog = input.appWatchdog;
	}

	async launchRecipe(input: LaunchPipelineInput): Promise<PipelineSessionRecord> {
		const recipe = await this.recipeService.readRecipe(input.recipeId);
		const projectDir = canonicalProjectPath(
			await this.projectService.resolveProjectPath(input.projectDir),
		);
		const parameters = resolveParameters({
			parameters: input.parameters,
			projectDir,
			recipe,
		});
		// Recipe-level metadataOnly is a default; a per-launch override wins when
		// either source is true (the boundary is opt-out — once a recipe declares
		// metadata-only, every launch path enforces it).
		const metadataOnly = input.metadataOnly === true || recipe.metadataOnly === true;
		// Refuse metadata-only sessions on non-git projects: neither the CLI
		// --write-allowlist guard (which needs git snapshot/diff/revert) nor the
		// pipeline-level backstop (which needs git porcelain status) can enforce the
		// .aidd/-only write boundary without git. Proceeding unguarded would violate
		// the metadata-only promise silently.
		if (metadataOnly) {
			if (!(await isGitRepository(projectDir))) {
				throw new Error(
					`Metadata-only pipeline sessions require a git repository for write-boundary enforcement; ${projectDir} is not a git repository.`,
				);
			}
		}
		const sessionId = createPipelineSessionId();
		const startedAt = Date.now();
		const recipeSha256 = sha256Json(recipe);
		const launchTarget = normalizeLaunchTarget(input.launchTarget);
		await this.db.insert(pipelineSessions).values({
			currentStepIndex: 0,
			id: sessionId,
			initiator: input.initiator,
			launchBackend: launchTarget?.backend ?? null,
			launchModel: launchTarget?.model ?? null,
			launchReasoningEffort: launchTarget?.reasoningEffort ?? null,
			metadataOnly: metadataOnly ? 1 : 0,
			parametersJson: JSON.stringify(parameters),
			projectName: basename(projectDir),
			projectPath: projectDir,
			recipeId: recipe.id,
			recipeName: recipe.name,
			recipeSha256,
			scheduledTaskExecutionId: input.scheduledTaskExecutionId ?? null,
			startedAt,
			status: 'queued',
			totalSteps: recipe.steps.length,
		});
		recordDataMovement({
			category: 'database',
			operation: 'pipeline.session.insert',
			status: 'success',
			summary: { recipeId: recipe.id, sessionId, totalSteps: recipe.steps.length },
			target: 'pipelineSessions',
		});
		const session = await this.report.getSession(sessionId);
		if (!session) throw new Error(`Pipeline session was not persisted: ${sessionId}`);
		// Synthetic `skill:<id>` sessions are one-shot skill launches; the
		// skill step itself records the (sole) telemetry event, so the wrapper
		// recipe is invisible in telemetry.
		const invocationId = recipe.id.startsWith(SKILL_RECIPE_PREFIX)
			? undefined
			: await this.telemetryService.recordStart({
					projectName: basename(projectDir),
					projectPath: projectDir,
					resourceId: recipe.id,
					resourceName: recipe.name,
					resourceSha256: recipeSha256,
					resourceType: 'recipe',
					sessionId,
					source: input.source ?? 'web',
					startedAt,
				});
		// Invariant: one live execution per session id (a second would duplicate step rows).
		if (this.activeExecutions.has(sessionId)) {
			throw new Error(`Pipeline session ${sessionId} already has an active execution.`);
		}
		// Preflight and supervise the project's app before the first step runs. A session whose
		// steps verify against a dead app does not fail — every step parks its feature and the
		// session reports green — so the app has to be brought back up front and kept up.
		await this.appWatchdog?.watch(projectDir);
		const execution = this.sessionExecutor
			.execute(recipe, {
				depth: 0,
				displayOrder: 0,
				initiator: input.initiator,
				invocationId,
				launchTarget,
				lineage: [recipe.id],
				metadataOnly,
				parameters,
				projectDir,
				scheduledTaskExecutionId: input.scheduledTaskExecutionId,
				sessionId,
				source: input.source ?? 'web',
			})
			.catch(() => {
				// Background execution failures (including post-shutdown DB errors) are
				// swallowed here so they never bubble as unhandled rejections. The session
				// row itself is reconciled to a terminal state inside executeSession's
				// catch/finally; if both update paths fail (e.g. the DB is already closed)
				// there's nothing actionable left to do.
			})
			.finally(() => {
				this.activeExecutions.delete(sessionId);
				this.appWatchdog?.unwatch(projectDir);
			});
		this.activeExecutions.set(sessionId, execution);
		return session;
	}

	// Picks up a previously-launched session whose orchestration loop died with web. The
	// session row stays put (no new id, no duplicate telemetry recordStart); we only kick
	// off a fresh background execution that resumes from the resolution coordinates.
	resumeSession(input: {
		recipe: RecipeDefinition;
		resolution: ResumeResolution;
		session: PipelineSessionRow;
	}): void {
		// A second concurrent execution duplicates step rows; a live session is not stale.
		if (this.activeExecutions.has(input.session.id)) {
			webLogger.warn(
				{ sessionId: input.session.id },
				'resumeSession skipped: session already has an active execution',
			);
			return;
		}
		const parameters = parseSessionParameters(input.session.parametersJson);
		const context: ExecutionContext = {
			depth: 0,
			displayOrder: input.resolution.displayOrder,
			// Read back rather than re-derived. A session with NULL here has nothing recorded, and
			// the source-based derivation is all that is left to go on for it — for every session
			// that recorded one, a Run now that crashed and resumed stays the operator's work.
			initiator:
				asRunInitiator(input.session.initiator) ??
				(input.session.scheduledTaskExecutionId ? 'automatic' : 'operator'),
			launchTarget: launchTargetFromSessionRow(input.session),
			lineage: [input.recipe.id],
			metadataOnly: input.session.metadataOnly === 1,
			parameters,
			projectDir: input.session.projectPath,
			scheduledTaskExecutionId: input.session.scheduledTaskExecutionId ?? undefined,
			sessionId: input.session.id,
			source: input.session.scheduledTaskExecutionId ? 'scheduled' : 'web',
		};
		// resumeSession is synchronous by contract, so the preflight runs alongside the resumed
		// execution rather than ahead of it; a crashed app is restarted a beat later either way.
		void this.appWatchdog?.watch(context.projectDir);
		const execution = this.resumeExecution(input.recipe, context, input.resolution)
			.catch(() => {
				// Mirrors launchRecipe — resumed executions also swallow post-shutdown DB
				// rejections at this boundary so they never bubble as unhandled rejections.
			})
			.finally(() => {
				this.activeExecutions.delete(input.session.id);
				this.appWatchdog?.unwatch(context.projectDir);
			});
		this.activeExecutions.set(input.session.id, execution);
	}

	/**
	 * Recovers the session's root invocation, then resumes.
	 *
	 * The context above reads `initiator` and `launchTarget` back off the session row for one
	 * reason: this is the same session, and what it recorded at launch stays true across a web
	 * restart. Its root invocation is the same kind of fact, but it lives in the telemetry event
	 * rather than on the row, so it is fetched here — before any step runs, because a step that
	 * starts without it records a child event with a parent resource id and a NULL parent
	 * invocation, which the nested/top-level split on /telemetry counts as a top-level launch.
	 * @param recipe
	 * @param context
	 * @param resolution
	 */
	private async resumeExecution(
		recipe: RecipeDefinition,
		context: ExecutionContext,
		resolution: ResumeResolution,
	): Promise<void> {
		context.invocationId = await this.telemetryService.findSessionRootInvocationId(
			context.sessionId,
		);
		await this.sessionExecutor.resume(recipe, context, resolution);
	}
}
