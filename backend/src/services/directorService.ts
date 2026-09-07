import type {
	DirectorChatMessageInput,
	DirectorChatMessageRecord,
	DirectorChatSessionRecord,
	DirectorCycleInput,
	DirectorCycleRecord,
	DirectorOutput,
	DirectorProfileRecord,
	DirectorProfileUpdate,
} from 'aidd-shared';
import type { RunInitiator } from 'aidd-shared/metadata/active-runs';

import { createBackend } from 'aidd-shared/backends/factory';

import type { WebDatabase } from '../db/client.ts';
import type { DbCommands } from '../db/commands.ts';
import type { WebSocketHub } from '../webSocketHub.ts';
import type { ChatAgentToolContext } from './director/chatAgentTools.ts';
import type { OperatorLaunchOutcome } from './director/operatorLaunch.ts';
import type { BackendFactory, DirectorConfig, FleetSummary } from './director/types.ts';

import { type suggestions } from '../db/schema.ts';
import { type DirectAiRunner, disabledDirectAiRunner } from './directAiService.ts';
import {
	autoLaunchBounds,
	projectBusyCheck,
	projectPathIndex,
	readDirtyFileCount,
} from './director/autoLaunchWiring.ts';
import { DirectorChatAgent } from './director/chatAgent.ts';
import { DirectorChatService } from './director/chatService.ts';
import { DirectorCycleService } from './director/cycleService.ts';
import { DirectorFleetSummaryService } from './director/fleetSummaryService.ts';
import { launchSuggestionForOperator } from './director/operatorLaunch.ts';
import { DirectorProfileService } from './director/profileService.ts';
import { runCycleAutoLaunch } from './director/suggestionAutoLaunch.ts';
import { DirectorSuggestionService } from './director/suggestionService.ts';
import { type PipelineService } from './pipelineService.ts';
import { type ProjectService } from './projectService.ts';
import { type RecipeService } from './recipeService.ts';
import { type RunService } from './runService.ts';

interface DirectorRecipeServices {
	pipelineService: PipelineService;
	recipeService: RecipeService;
}

export class DirectorService {
	private config: DirectorConfig;
	private readonly db: WebDatabase;
	private readonly profileService: DirectorProfileService;
	private readonly fleetSummaryService: DirectorFleetSummaryService;
	private readonly chatService: DirectorChatService;
	private readonly suggestionService: DirectorSuggestionService;
	private readonly cycleService: DirectorCycleService;

	constructor(
		config: DirectorConfig,
		db: WebDatabase,
		commands: DbCommands,
		hub: WebSocketHub,
		projectService: ProjectService,
		runService: RunService,
		backendFactory: BackendFactory = createBackend,
		directAiService: DirectAiRunner = disabledDirectAiRunner,
		recipeServices?: DirectorRecipeServices,
	) {
		this.config = config;
		this.db = db;
		const getConfig = (): DirectorConfig => this.config;
		this.profileService = new DirectorProfileService(db, getConfig);
		this.fleetSummaryService = new DirectorFleetSummaryService(db, projectService, getConfig);
		// The tool context closes over `this.*` services lazily: suggestionService and cycleService
		// are assigned later in this constructor, but a tool is only ever dispatched at chat time,
		// long after construction completes. This breaks the chatService <-> cycleService cycle
		// without a hard constructor ordering dependency.
		const toolContext: ChatAgentToolContext = {
			dismissSuggestion: async (id) => {
				const dismissed = await this.suggestionService.dismissSuggestion(id);
				if (!dismissed)
					throw new Error(`Suggestion is not pending or does not exist: ${id}`);
			},
			getFleetSummary: () => this.fleetSummaryService.getFleetSummary(),
			getProjectDetail: (projectId) => projectService.getProjectDetail(projectId),
			getRecipe: async (recipeId) => {
				if (!recipeServices) throw new Error('Recipe inspection is unavailable.');
				return await recipeServices.recipeService.readRecipe(recipeId);
			},
			getRun: (id) => runService.getRun(id),
			killRun: (id) => runService.killRun(id),
			launchRun: async (input) => {
				// The chat agent launches on a request somebody made a moment ago: it is a proxy
				// for a person, not a background trigger, so its runs are recorded as operator work.
				const run = await runService.launchRun(input, { initiator: 'operator' });
				return { id: run.id, mode: run.mode, projectName: run.projectName };
			},
			launchSuggestion: async (id) => {
				// Same absorption a person gets on the web route: the agent is asking on somebody's
				// behalf, so losing the race to the Director's own launcher is not a failure to
				// report — but it is also not a launch to take credit for, hence alreadyRunning.
				const outcome = await launchSuggestionForOperator(db, id, () =>
					this.suggestionService.launchSuggestion(id),
				);
				return {
					id,
					...(outcome.claimedElsewhere ? { alreadyRunning: true as const } : {}),
					...(outcome.launch?.kind === 'pipeline'
						? { pipelineSessionId: outcome.launch.pipelineSessionId }
						: {}),
					...(outcome.launch?.kind === 'run' ? { runId: outcome.launch.runId } : {}),
				};
			},
			listProjects: () => projectService.listProjects(),
			listSuggestions: () => this.suggestionService.listSuggestions(),
			readRunOutput: (id) => runService.readOutput(id),
			resolveDiscoveredProject: (projectId) =>
				projectService.resolveDiscoveredProject(projectId),
			startCycle: (input) => this.cycleService.startCycle(input),
			stopRun: (id) => runService.stopRun(id),
		};
		const chatAgent = new DirectorChatAgent({
			resolveClient: () => directAiService.resolveClientConfig('directorChat'),
			toolContext,
		});
		this.chatService = new DirectorChatService(
			db,
			getConfig,
			backendFactory,
			directAiService,
			this.profileService,
			this.fleetSummaryService,
			chatAgent,
			async () => {
				if (!recipeServices) return [];
				return (await recipeServices.recipeService.listRecipes()).map((recipe) => ({
					id: recipe.id,
					name: recipe.name,
					...(recipe.description === undefined
						? {}
						: { description: recipe.description }),
				}));
			},
		);
		this.suggestionService = new DirectorSuggestionService(
			db,
			hub,
			projectService,
			runService,
			recipeServices
				? {
						findRecipeByName: (name) =>
							recipeServices.recipeService.findRecipeByName(name),
						launchRecipe: (input) => recipeServices.pipelineService.launchRecipe(input),
					}
				: undefined,
		);
		const projectBusy = projectBusyCheck(db, (path) => runService.hasActiveRunForProject(path));
		this.cycleService = new DirectorCycleService({
			autoLaunchSuggestions: (cycleId) =>
				runCycleAutoLaunch(
					{
						db,
						hub,
						resolveDeps: () => ({
							config: autoLaunchBounds(this.config),
							dirtyTreeThreshold: this.config.dirtyTreeThreshold,
							hasActiveWorkForProject: projectBusy,
							launch: (id) =>
								this.suggestionService.launchSuggestion(id, 'automatic'),
							listPending: (id) =>
								this.suggestionService.listCyclePendingSuggestions(id),
							readDirtyFileCount,
							resolveProjectPaths: () =>
								projectPathIndex(() => projectService.listProjects()),
						}),
					},
					cycleId,
				),
			chatService: this.chatService,
			commands,
			db,
			directAiService,
			fleetSummaryService: this.fleetSummaryService,
			getConfig,
			hub,
			profileService: this.profileService,
			runService,
		});
	}

	updateConfig(config: DirectorConfig): void {
		this.config = config;
	}

	// Stops the in-process await-and-persist loops for in-flight cycles. The
	// detached runs they launched (source='director') keep running and will
	// be resumed via reconcileStaleCycles on the next web start.
	markDisposed(): void {
		this.cycleService.markDisposed();
	}

	async getProfile(): Promise<DirectorProfileRecord> {
		return this.profileService.getProfile();
	}

	async updateProfile(input: DirectorProfileUpdate): Promise<DirectorProfileRecord> {
		return this.profileService.updateProfile(input);
	}

	async getFleetSummary(): Promise<FleetSummary> {
		return this.fleetSummaryService.getFleetSummary();
	}

	async listChatSessions(): Promise<DirectorChatSessionRecord[]> {
		return this.chatService.listChatSessions();
	}

	async createChatSession(title?: string): Promise<DirectorChatSessionRecord> {
		return this.chatService.createChatSession(title);
	}

	async deleteChatSession(sessionId: string): Promise<void> {
		return this.chatService.deleteChatSession(sessionId);
	}

	async listChatMessages(sessionId: string): Promise<DirectorChatMessageRecord[]> {
		return this.chatService.listChatMessages(sessionId);
	}

	async sendChatMessage(
		sessionId: string,
		input: DirectorChatMessageInput,
	): Promise<{
		assistant: DirectorChatMessageRecord;
		user: DirectorChatMessageRecord;
	}> {
		return this.chatService.sendChatMessage(sessionId, input);
	}

	async dismissSuggestion(id: string): Promise<boolean> {
		return this.suggestionService.dismissSuggestion(id);
	}

	async listSuggestions(): Promise<(typeof suggestions.$inferSelect)[]> {
		return this.suggestionService.listSuggestions();
	}

	/**
	 * Launches a suggestion on behalf of a person — the web Launch button and the chat agent.
	 *
	 * Distinct from the raw service method the auto-launcher uses: the two want opposite things from
	 * a lost claim. The launcher records it and moves on; a person is told the work is running,
	 * because it is, and shown no error for a race they could not have known about.
	 *
	 * @param id The suggestion being launched.
	 * @returns What is in flight, and whether something else had already claimed it.
	 */
	async launchSuggestion(id: string): Promise<OperatorLaunchOutcome> {
		return launchSuggestionForOperator(this.db, id, () =>
			this.suggestionService.launchSuggestion(id),
		);
	}

	async listCycles(): Promise<DirectorCycleRecord[]> {
		return this.cycleService.listCycles();
	}

	async reconcileStaleCycles(): Promise<void> {
		return this.cycleService.reconcileStaleCycles();
	}

	// Start the cycle a due scheduled occurrence claimed. Automatic cycles are ordinary scheduled
	// tasks now, so the cadence, timezone, and next-run time all live on the Scheduled surface
	// rather than in a private timer here.
	startScheduledCycle(
		scheduledTaskExecutionId: string,
		initiator: RunInitiator,
	): Promise<{ cycleId: string } | { skipped: string }> {
		return this.cycleService.startScheduledCycle(scheduledTaskExecutionId, initiator);
	}

	async runCycle(
		input: DirectorCycleInput = {},
	): Promise<{ cycleId: string; output: DirectorOutput | undefined }> {
		return this.cycleService.runCycle(input);
	}
}
