import type { WebDatabase } from '../../backend/src/db/client.ts';
import type { DbCommands } from '../../backend/src/db/commands.ts';
import type { ProjectService } from '../../backend/src/services/projectService.ts';
import type { QueriesContext } from '../../backend/src/services/run/queries.ts';

import { DirectorChatService } from '../../backend/src/services/director/chatService.ts';
import { DirectorCycleService } from '../../backend/src/services/director/cycleService.ts';
import { DirectorFleetSummaryService } from '../../backend/src/services/director/fleetSummaryService.ts';
import { DirectorProfileService } from '../../backend/src/services/director/profileService.ts';
import { DirectorSuggestionService } from '../../backend/src/services/director/suggestionService.ts';
import { buildDirectorProjectPriority } from '../../backend/src/services/directorPriority.ts';
import { buildDashboardSummary } from '../../backend/src/services/project/dashboardSummary.ts';
import { listRunsPage } from '../../backend/src/services/run/historyQueries.ts';
import {
	makeDashboardFeatures,
	makeDashboardFleet,
	makeDashboardPortStatus,
} from './dashboard-fleet-fixture.ts';
import { createDirectorDb, seedConfig, seedDirectorTables } from './dashboard-initial-seed.ts';
import { repoRoot } from './source-scan.ts';

/** Builds one endpoint's response body, wrapped exactly as its route wraps it. */
export type EndpointBodyBuilder = () => Promise<unknown>;

/**
 * Every Director list service assigns its collaborators in the constructor and touches none of
 * them on the read path measured here — `listCycles`, `listSuggestions` and `listChatSessions`
 * read the DB (plus the config provider and an empty active-stage map). Building the real launcher
 * graph would drag backends, the WebSocket hub and the filesystem into a byte measurement, so the
 * unused halves are cast in. If one of those reads ever grows a collaborator call, it throws here
 * rather than silently measuring something else.
 */
function unusedCollaborator<T>(): T {
	return null as unknown as T;
}

async function fleetBody(db: WebDatabase): Promise<unknown> {
	// A second fixture instance: `enumerate.ts` stamps the computed priority health back onto the
	// summary it returns, and mutating the instance the dashboard-summary body is built from would
	// make one endpoint's bytes depend on another's.
	const fleet = makeDashboardFleet();
	const projects = await Promise.all(
		fleet.map(async (summary) => {
			const prioritySummary = await buildDirectorProjectPriority(summary, {
				// The catalog the audit names are discovered from. The fixture's project paths do
				// not exist, so every audit reads as missing — the same answer on every machine.
				catalogDir: repoRoot,
				features: makeDashboardFeatures(summary),
			});
			summary.priorityHealth = prioritySummary.priorityHealth;
			return { prioritySummary, summary };
		}),
	);
	const projectService = {
		listProjectListings: async () => ({ projects }),
	} as unknown as ProjectService;
	const service = new DirectorFleetSummaryService(db, projectService, seedConfig);
	return { fleet: await service.getFleetSummary() };
}

async function cyclesBody(db: WebDatabase): Promise<unknown> {
	const service = new DirectorCycleService({
		autoLaunchSuggestions: unusedCollaborator(),
		chatService: unusedCollaborator(),
		commands: unusedCollaborator(),
		db,
		directAiService: unusedCollaborator(),
		fleetSummaryService: unusedCollaborator(),
		getConfig: seedConfig,
		hub: unusedCollaborator(),
		profileService: unusedCollaborator(),
		runService: unusedCollaborator(),
	});
	return { cycles: await service.listCycles() };
}

async function suggestionsBody(db: WebDatabase): Promise<unknown> {
	const service = new DirectorSuggestionService(
		db,
		unusedCollaborator(),
		unusedCollaborator(),
		unusedCollaborator(),
	);
	return { suggestions: await service.listSuggestions() };
}

async function chatSessionsBody(
	db: WebDatabase,
	profileService: DirectorProfileService,
): Promise<unknown> {
	const service = new DirectorChatService(
		db,
		seedConfig,
		unusedCollaborator(),
		unusedCollaborator(),
		profileService,
		unusedCollaborator(),
		unusedCollaborator(),
	);
	return { sessions: await service.listChatSessions() };
}

async function runsBody(db: WebDatabase, commands: DbCommands): Promise<unknown> {
	// The Runs feed's own read path, merge and all: seeded web rows, the Director cycle
	// projections the list folds in, and a CLI heartbeat scan that finds nothing because the
	// seeded root does not exist. `useRuns()` sends no query parameters, so neither does this.
	const ctx = {
		commands,
		config: seedConfig(),
		db,
		hub: unusedCollaborator(),
	} as unknown as QueriesContext;
	const page = await listRunsPage(ctx, {});
	return { nextCursor: page.nextCursor, runs: page.items };
}

function dashboardSummaryBody(): unknown {
	const fleet = makeDashboardFleet();
	return buildDashboardSummary(fleet, makeDashboardPortStatus(fleet));
}

/**
 * One body builder per endpoint on the Dashboard's initial request set, each wrapping the same
 * service or projection its route wraps. Keyed by the endpoint path so the request set derived
 * from the frontend source can be checked against it: an initial endpoint with no builder here is
 * an endpoint whose growth no budget would notice.
 */
export async function createInitialEndpointBuilders(): Promise<Map<string, EndpointBodyBuilder>> {
	const { commands, db } = createDirectorDb();
	const profileService = new DirectorProfileService(db, seedConfig);
	// The real service creates the default profile row on first read; chat sessions key off it.
	const profile = await profileService.ensureDefaultProfile();
	await seedDirectorTables(db, profile.id);

	return new Map<string, EndpointBodyBuilder>([
		['/api/v1/director/chat/sessions', () => chatSessionsBody(db, profileService)],
		['/api/v1/director/cycles', () => cyclesBody(db)],
		['/api/v1/director/fleet', () => fleetBody(db)],
		['/api/v1/director/profile', async () => ({ profile: await profileService.getProfile() })],
		['/api/v1/director/suggestions', () => suggestionsBody(db)],
		['/api/v1/projects/dashboard-summary', async () => dashboardSummaryBody()],
		['/api/v1/runs', () => runsBody(db, commands)],
	]);
}

/** Serialized size of each initial endpoint's real response body, in bytes. */
export async function measureInitialEndpointBytes(): Promise<Map<string, number>> {
	const builders = await createInitialEndpointBuilders();
	const bytes = new Map<string, number>();
	for (const [endpoint, build] of builders) {
		bytes.set(endpoint, Buffer.byteLength(JSON.stringify(await build()), 'utf8'));
	}
	return bytes;
}
