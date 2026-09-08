import { createBackend } from 'aidd-shared/backends/factory';
import { type ResolvedConfig, type ResolvedWebConfig } from 'aidd-shared/config';

import type { WebDatabase } from './db/client.ts';
import type { DirectAiService } from './services/directAiService.ts';
import type { ProjectService } from './services/projectService.ts';
import type { RunService } from './services/runService.ts';
import type { SettingsService } from './services/settingsService.ts';

import { listProjectAuditCatalog } from './services/maturityCompute.ts';
import {
	createSetupActivityProvider,
	listSetupPipelineSessions,
} from './services/project/setupActivity.ts';

export interface ProjectExecutionStateWiring {
	db: WebDatabase;
	projectService: ProjectService;
	runService: RunService;
}

export interface ProjectAdvisorWiring {
	directAiService: DirectAiService;
	projectService: ProjectService;
	rootDir: string;
	runService: RunService;
	settingsService: SettingsService;
}

/**
 * Give the project listings a view of what is actually executing.
 *
 * ProjectService reads the filesystem; runs and pipeline sessions live in the database, behind
 * services it must not depend on. Both views arrive as providers instead, so a project short of the
 * coding phase reports the work it really has — or says it has none — rather than a standing
 * "preparing" inferred from the phase alone.
 *
 * @param wiring The project service to wire, and the run service and database it reads through.
 */
export function wireProjectExecutionState(wiring: ProjectExecutionStateWiring): void {
	const { db, projectService, runService } = wiring;
	projectService.setActiveRunSummaryProvider((paths) => runService.listActiveRunSummaries(paths));
	projectService.setSetupActivityProvider(
		createSetupActivityProvider({
			listPipelineSessions: (projectPath) => listSetupPipelineSessions(db, projectPath),
			listRuns: (projectPath) => runService.listRunsForProject(projectPath),
		}),
	);
}

/**
 * Give the project listings their maturity catalog and the advisor's model access.
 *
 * The advisor reads the live resolved configuration on every call rather than a boot-time snapshot,
 * so a settings change takes effect without a restart.
 *
 * @param wiring The project service to wire, and the services and root directory it reads through.
 */
export async function wireProjectAdvisors(wiring: ProjectAdvisorWiring): Promise<void> {
	const { directAiService, projectService, rootDir, runService, settingsService } = wiring;
	projectService.setMaturityContext({
		auditCatalogDir: rootDir,
		auditCatalogNames: await listProjectAuditCatalog(rootDir),
		getLatestProjectAuditRun: (projectPath) => runService.latestProjectAuditRun(projectPath),
	});
	projectService.setAdvisor({
		backendFactory: createBackend,
		directAiService,
		getFullConfig: () =>
			settingsService.getCurrentResolvedConfig() as {
				web: ResolvedWebConfig;
			} & ResolvedConfig,
	});
}
