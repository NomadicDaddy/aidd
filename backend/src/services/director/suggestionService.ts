import { buildSuggestionPrompt } from 'aidd-shared/contracts/director';
import { and, desc, eq, inArray } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { RunLaunchRequest } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { PipelineService } from '../pipelineService.ts';
import type { ProjectService } from '../projectService.ts';
import type { RecipeService } from '../recipeService.ts';
import type { RunService } from '../runService.ts';

import { suggestions } from '../../db/schema.ts';

// Parses the persisted suggestedArgs JSON string into a flat string map. The director
// stores args as JSON (see DirectorSuggestionRecord.suggestedArgs); a malformed or
// non-object value yields an empty map so launch falls back to a plain prompt run.
function parseSuggestedArgs(value: null | string): Record<string, string> {
	if (!value) return {};
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const out: Record<string, string> = {};
		for (const [key, entry] of Object.entries(parsed)) {
			if (typeof entry === 'string') out[key] = entry;
		}
		return out;
	} catch {
		return {};
	}
}

// Turns a suggestion into a targeted run: when the suggestion carries structured args
// (a specific finding/feature id, or an audit sweep) those map onto first-class
// RunLaunchRequest fields so the run operates on exactly that artifact instead of a
// generic project-wide coding prompt. The prompt still carries the title/description/
// reasoning for the agent's context.
function buildSuggestionRunLaunchRequest(
	suggestion: typeof suggestions.$inferSelect,
	projectDir: string
): RunLaunchRequest {
	const args = parseSuggestedArgs(suggestion.suggestedArgs);
	const request: RunLaunchRequest = {
		projectDir,
		prompt: buildSuggestionPrompt(suggestion),
	};
	if (args.filterBy) request.filterBy = args.filterBy;
	if (args.filterValue) request.filterValue = args.filterValue;
	if (args.feature) request.feature = args.feature;
	if (args.auditAll === 'true') request.auditAll = true;
	if (args.auditNames) {
		const names = args.auditNames
			.split(',')
			.map((name) => name.trim())
			.filter(Boolean);
		if (names.length > 0) request.auditNames = names;
	}
	// audit-maintenance suggestions refresh audit reports; everything else targets a
	// specific finding/feature via coding mode (which honors --feature/--filter*).
	request.mode = request.auditAll || request.auditNames !== undefined ? 'audit' : 'coding';
	return request;
}
export type DirectorSuggestionLaunch =
	{ kind: 'pipeline'; pipelineSessionId: string } | { kind: 'run'; runId: string };

interface DirectorRecipeLauncher {
	findRecipeByName: RecipeService['findRecipeByName'];
	launchRecipe: PipelineService['launchRecipe'];
}

export class DirectorSuggestionService {
	private readonly db: WebDatabase;
	private readonly hub: WebSocketHub;
	private readonly projectService: ProjectService;
	private readonly recipeLauncher: DirectorRecipeLauncher | undefined;
	private readonly runService: RunService;

	constructor(
		db: WebDatabase,
		hub: WebSocketHub,
		projectService: ProjectService,
		runService: RunService,
		recipeLauncher?: DirectorRecipeLauncher
	) {
		this.db = db;
		this.hub = hub;
		this.projectService = projectService;
		this.recipeLauncher = recipeLauncher;
		this.runService = runService;
	}

	async dismissSuggestion(id: string): Promise<void> {
		// dismissedBy 'user' marks an explicit operator rejection — the signal persistCycleResult
		// uses to suppress identical re-suggestions (the per-cycle retire sweep sets
		// 'cycle_retire' instead and never suppresses). Guarded to actionable states: a delayed
		// or duplicate request must not relabel launched/completed work — or a cycle_retire — as
		// a user rejection, which would wrongly suppress equivalent suggestions for 14 days.
		const updated = await this.db
			.update(suggestions)
			.set({ dismissedBy: 'user', resolvedAt: Date.now(), status: 'dismissed' })
			.where(
				and(eq(suggestions.id, id), inArray(suggestions.status, ['launching', 'pending']))
			)
			.returning({ id: suggestions.id });
		if (updated.length === 0) return;
		this.hub.broadcast({ payload: { id, status: 'dismissed' }, type: 'suggestion_status' });
	}

	async listSuggestions(): Promise<(typeof suggestions.$inferSelect)[]> {
		return await this.db
			.select()
			.from(suggestions)
			.orderBy(desc(suggestions.createdAt))
			.limit(100);
	}

	async launchSuggestion(id: string): Promise<DirectorSuggestionLaunch> {
		const suggestion = (
			await this.db.select().from(suggestions).where(eq(suggestions.id, id))
		)[0];
		if (!suggestion) throw new Error(`Suggestion not found: ${id}`);
		if (suggestion.projectId === null) {
			throw new Error(
				'Fleet-wide suggestions cannot be launched directly. Select a project-scoped suggestion or dismiss this one.'
			);
		}
		const { projects: candidates } = await this.projectService.listProjects();
		const project = candidates.find((candidate) => candidate.name === suggestion.projectId);
		if (!project) throw new Error(`Suggestion project is unavailable: ${suggestion.projectId}`);

		// Atomically claim the suggestion before spawning. Two concurrent launchSuggestion calls
		// for the same id both read the row as pending above, but only the caller whose
		// compare-and-set flips 'pending' -> 'launching' wins; the loser updates zero rows and
		// throws, so exactly one run is ever spawned for a suggestion.
		const claimed = await this.db
			.update(suggestions)
			.set({ status: 'launching' })
			.where(and(eq(suggestions.id, id), eq(suggestions.status, 'pending')))
			.returning({ id: suggestions.id });
		if (claimed.length === 0) {
			throw new Error(
				`Suggestion is no longer pending (already launching, launched, or dismissed): ${id}`
			);
		}

		let launched: DirectorSuggestionLaunch;
		try {
			launched = suggestion.suggestedRecipe
				? await this.launchRecipeSuggestion(suggestion, project.path)
				: await this.launchRunSuggestion(suggestion, project.path);
		} catch (err) {
			// The spawn failed after we claimed the suggestion. Release the claim so the
			// suggestion returns to the actionable 'pending' state and can be retried.
			await this.db
				.update(suggestions)
				.set({ status: 'pending' })
				.where(and(eq(suggestions.id, id), eq(suggestions.status, 'launching')));
			throw err;
		}

		const launchedPipelineSessionId =
			launched.kind === 'pipeline' ? launched.pipelineSessionId : null;
		const launchedRunId = launched.kind === 'run' ? launched.runId : null;
		await this.db
			.update(suggestions)
			.set({
				launchedPipelineSessionId,
				launchedRunId,
				resolvedAt: Date.now(),
				status: 'launched',
			})
			.where(eq(suggestions.id, id));
		this.hub.broadcast({
			payload: { id, launchedPipelineSessionId, launchedRunId, status: 'launched' },
			type: 'suggestion_status',
		});
		return launched;
	}

	private async launchRunSuggestion(
		suggestion: typeof suggestions.$inferSelect,
		projectDir: string
	): Promise<DirectorSuggestionLaunch> {
		const run = await this.runService.launchRun(
			buildSuggestionRunLaunchRequest(suggestion, projectDir)
		);
		return { kind: 'run', runId: run.id };
	}

	private async launchRecipeSuggestion(
		suggestion: typeof suggestions.$inferSelect,
		projectDir: string
	): Promise<DirectorSuggestionLaunch> {
		if (!this.recipeLauncher) {
			throw new Error('Recipe-backed Director suggestion launches are unavailable.');
		}
		const recipeName = suggestion.suggestedRecipe;
		if (!recipeName) throw new Error('Director suggestion has no recipe to launch.');
		const recipe = await this.recipeLauncher.findRecipeByName(recipeName);
		if (!recipe) throw new Error(`Suggested recipe not found: ${recipeName}`);
		const pipelineSession = await this.recipeLauncher.launchRecipe({
			parameters: parseSuggestedArgs(suggestion.suggestedArgs),
			projectDir,
			recipeId: recipe.id,
		});
		return { kind: 'pipeline', pipelineSessionId: pipelineSession.id };
	}
}
