import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands } from '../../db/commands.ts';
import type { RunRecord, WebRunStatus } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { CursorPage } from '../pagination.ts';

import { type runs } from '../../db/schema.ts';
import { getDirectorCycleRunRecord } from './directorCycleRuns.ts';
import {
	annotatedWebRunRecord,
	getRun as getRunInternal,
	hasActiveRunForProject as hasActiveRunForProjectInternal,
	listActiveRunSummaries as listActiveRunSummariesInternal,
	latestProjectAuditRun as latestProjectAuditRunInternal,
	type ListRunsPageOptions,
	type ProjectActiveRunSummary,
	listRuns as listRunsInternal,
	listRunsForProject as listRunsForProjectInternal,
	listRunsForProjectPage as listRunsForProjectPageInternal,
	listRunsPage as listRunsPageInternal,
	purgeProjectRuns as purgeProjectRunsInternal,
	type QueriesContext,
	updateProjectPathReferences as updateProjectPathReferencesInternal,
} from './queries.ts';

export class RunQueryService {
	protected config: ResolvedConfig & { web: ResolvedWebConfig };
	protected readonly commands: DbCommands;
	protected readonly db: WebDatabase;
	protected readonly hub: WebSocketHub;
	protected readonly onProjectChanged: (projectPath: string) => void;

	constructor(
		config: ResolvedConfig & { web: ResolvedWebConfig },
		db: WebDatabase,
		commands: DbCommands,
		hub: WebSocketHub,
		onProjectChanged: (projectPath: string) => void
	) {
		this.config = config;
		this.commands = commands;
		this.db = db;
		this.hub = hub;
		this.onProjectChanged = onProjectChanged;
	}

	async getRun(id: string): Promise<typeof runs.$inferSelect | undefined> {
		return getRunInternal(this.db, id);
	}

	async getRunRecord(id: string): Promise<RunRecord | undefined> {
		const run = await this.getRun(id);
		if (run) return annotatedWebRunRecord(run);
		return getDirectorCycleRunRecord(this.queriesContext(), id);
	}

	async listRuns(limit = 100, status?: WebRunStatus): Promise<RunRecord[]> {
		return listRunsInternal(this.queriesContext(), limit, status);
	}

	async listRunsForProject(
		projectPath: string,
		limit = 20,
		status?: WebRunStatus
	): Promise<RunRecord[]> {
		return listRunsForProjectInternal(this.queriesContext(), projectPath, limit, status);
	}

	async listRunsPage(options: ListRunsPageOptions = {}): Promise<CursorPage<RunRecord>> {
		return listRunsPageInternal(this.queriesContext(), options);
	}

	async listRunsForProjectPage(
		projectPath: string,
		options: ListRunsPageOptions = {}
	): Promise<CursorPage<RunRecord>> {
		return listRunsForProjectPageInternal(this.queriesContext(), projectPath, options);
	}

	async hasActiveRunForProject(projectPath: string): Promise<boolean> {
		return hasActiveRunForProjectInternal(this.queriesContext(), projectPath);
	}

	async listActiveRunSummaries(
		projectPaths: readonly string[]
	): Promise<ReadonlyMap<string, ProjectActiveRunSummary>> {
		return listActiveRunSummariesInternal(this.queriesContext(), projectPaths);
	}

	async latestProjectAuditRun(projectPath: string): Promise<{
		finishedAt: null | number;
		runId: string;
		status: WebRunStatus;
	} | null> {
		return latestProjectAuditRunInternal(this.queriesContext(), projectPath);
	}

	async updateProjectPathReferences(sourcePath: string, destinationPath: string): Promise<void> {
		return updateProjectPathReferencesInternal(
			this.queriesContext(),
			sourcePath,
			destinationPath
		);
	}

	async purgeProjectRuns(projectPath: string): Promise<number> {
		return purgeProjectRunsInternal(this.queriesContext(), projectPath);
	}

	protected queriesContext(): QueriesContext {
		return {
			commands: this.commands,
			config: this.config,
			db: this.db,
			hub: this.hub,
			onProjectChanged: this.onProjectChanged,
		};
	}
}
