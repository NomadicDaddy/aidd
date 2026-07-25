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

import { createBackend } from 'aidd-shared/backends/factory';

import type { WebDatabase } from '../db/client.ts';
import type { DbCommands } from '../db/commands.ts';
import type { WebSocketHub } from '../webSocketHub.ts';
import type { ChatAgentToolContext } from './director/chatAgentTools.ts';
import type { BackendFactory, DirectorConfig, FleetSummary } from './director/types.ts';

import { type suggestions } from '../db/schema.ts';
import { type DirectAiRunner, disabledDirectAiRunner } from './directAiService.ts';
import { DirectorChatAgent } from './director/chatAgent.ts';
import { DirectorChatService } from './director/chatService.ts';
import { DirectorCycleService } from './director/cycleService.ts';
import { DirectorFleetSummaryService } from './director/fleetSummaryService.ts';
import { DirectorProfileService } from './director/profileService.ts';
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
		const getConfig = (): DirectorConfig => this.config;
		this.profileService = new DirectorProfileService(db, getConfig);
		this.fleetSummaryService = new DirectorFleetSummaryService(db, projectService, getConfig);
		// The tool context closes over `this.*` services lazily: suggestionService and cycleService
		// are assigned later in this constructor, but a tool is only ever dispatched at chat time,
		// long after construction completes. This breaks the chatService <-> cycleService cycle
		// without a hard constructor ordering dependency.
		const toolContext: ChatAgentToolContext = {
			dismissSuggestion: (id) => this.suggestionService.dismissSuggestion(id),
			getFleetSummary: () => this.fleetSummaryService.getFleetSummary(),
			getProjectDetail: (projectId) => projectService.getProjectDetail(projectId),
			getRecipe: async (recipeId) => {
				if (!recipeServices) throw new Error('Recipe inspection is unavailable.');
				return await recipeServices.recipeService.readRecipe(recipeId);
			},
			getRun: (id) => runService.getRun(id),
			killRun: (id) => runService.killRun(id),
			launchRun: async (input) => {
				const run = await runService.launchRun(input);
				return { id: run.id, mode: run.mode, projectName: run.projectName };
			},
			launchSuggestion: async (id) => {
				const launched = await this.suggestionService.launchSuggestion(id);
				return launched.kind === 'pipeline'
					? { id, pipelineSessionId: launched.pipelineSessionId }
					: { id, runId: launched.runId };
			},
			listProjects: () => projectService.listProjects(),
			listSuggestions: () => this.suggestionService.listSuggestions(),
			readRunOutput: (id) => runService.readOutput(id),
			resolveProjectPath: (path) => projectService.resolveProjectPath(path),
			startCycle: (input) => this.cycleService.startCycle(input),
			stopRun: (id) => runService.stopRun(id),
		};
		const chatAgent = new DirectorChatAgent({
			resolveClient: (model) => directAiService.resolveClientConfig('directorChat', model),
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
		this.cycleService = new DirectorCycleService({
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

	async dismissSuggestion(id: string): Promise<void> {
		return this.suggestionService.dismissSuggestion(id);
	}

	async listSuggestions(): Promise<(typeof suggestions.$inferSelect)[]> {
		return this.suggestionService.listSuggestions();
	}

	async launchSuggestion(
		id: string,
	): Promise<Awaited<ReturnType<DirectorSuggestionService['launchSuggestion']>>> {
		return this.suggestionService.launchSuggestion(id);
	}

	async listCycles(): Promise<DirectorCycleRecord[]> {
		return this.cycleService.listCycles();
	}

	async reconcileStaleCycles(): Promise<void> {
		return this.cycleService.reconcileStaleCycles();
	}

	// Begin the auto-cycle scheduler (runs an immediate catch-up check, then re-checks
	// on a fixed cadence). Call once the web process has warmed up so the startup
	// catch-up cycle does not contend with boot-time work.
	startScheduler(): void {
		this.cycleService.startScheduler();
	}

	async runCycle(
		input: DirectorCycleInput = {},
	): Promise<{ cycleId: string; output: DirectorOutput | undefined }> {
		return this.cycleService.runCycle(input);
	}
}
