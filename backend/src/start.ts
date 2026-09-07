import { createBackend } from 'aidd-shared/backends/factory';
import { getUserConfigPath, type ResolvedConfig, type ResolvedWebConfig } from 'aidd-shared/config';
import { setAiCallLogDir } from 'aidd-shared/lib/aiCallLog';
import { resolve } from 'node:path';

import { createWorkerWebDatabase } from './db/client.ts';
import { warnIfFrontendStale } from './frontendStaleness.ts';
import { webLogger } from './logger.ts';
import { createWebServer } from './server.ts';
import { createAppLauncher } from './services/appLauncher/create.ts';
import { startBackendLogRotation } from './services/backendLogRotation.ts';
import { createExecutionServices } from './services/createExecutionServices.ts';
import { DiaryService } from './services/diaryService.ts';
import { DirectAiService } from './services/directAiService.ts';
import { DirectorService } from './services/directorService.ts';
import { listProjectAuditCatalog } from './services/maturityCompute.ts';
import { MetricsService } from './services/metricsService.ts';
import { startOutcomeBackfills } from './services/outcome/startupBackfills.ts';
import { sweepSessionMetricsAtBoot } from './services/pipeline/sessionMetricsSweep.ts';
import { ProjectInitFailureService } from './services/project/initFailureService.ts';
import { ProjectService } from './services/projectService.ts';
import { createRetentionScheduler } from './services/retention/scheduler.ts';
import { RunService } from './services/runService.ts';
import { SettingsService } from './services/settingsService.ts';
import { TelegramBridgeService } from './services/telegramBridgeService.ts';
import { TelemetryService } from './services/telemetryService.ts';
import { loadPtyProvider } from './services/terminal/ptyProvider.ts';
import { TerminalSessionManager } from './services/terminal/sessionManager.ts';
import { detectShells } from './services/terminal/shellDetection.ts';
import {
	assertWebAuthTokenPresent,
	installProcessSafetyNet,
	probePublicInterface,
	removeWebPidFile,
	resolveEffectiveWebConfig,
	startRestartSupervisor,
	startSchedulesAfterProjectWarmup,
	warnRemoteAccess,
	wireDirectorScheduling,
	writeWebPidFile,
} from './startHelpers.ts';
import { WebSocketHub } from './webSocketHub.ts';

export { startMcpServer } from './mcp/start.ts';

export interface StartWebServerOptions {
	rootDir: string;
}
/**
 * Max time to wait for `app.stop(true)` to close the listener and drop active
 * connections before forcing DB teardown and exit, so a wedged socket cannot hang
 * shutdown indefinitely.
 */
const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * Delay before the deferred shutdown begins, so an in-flight HTTP response (the
 * 202 from the admin shutdown endpoint) flushes before the listener closes.
 */
const SHUTDOWN_RESPONSE_FLUSH_MS = 100;

export async function startWebServer(
	config: ResolvedConfig,
	options: StartWebServerOptions,
): Promise<number> {
	setAiCallLogDir(resolve(options.rootDir, 'logs'));
	const stopBackendLogRotation = startBackendLogRotation(resolve(options.rootDir, 'logs'));
	const webConfig = resolveEffectiveWebConfig(config, options.rootDir);
	const effectiveConfig = { ...config, web: webConfig };
	// A remote-bound panel must have a token before anything listens, and before the database is
	// opened so it fails cheaply. See `assertWebAuthTokenPresent` for why the check lives there.
	assertWebAuthTokenPresent(webConfig);
	installProcessSafetyNet();
	// Enforce the single-writer invariant: the worker acquires the writer lock and runs migrations
	// during init, so a second backend pointed at the same data directory is rejected before it can
	// establish a write-capable handle. Throws here if another live backend already owns it.
	const database = await createWorkerWebDatabase(effectiveConfig.web, options.rootDir);
	const webSocketHub = new WebSocketHub();
	const projectService = new ProjectService(effectiveConfig.web);
	const initFailureService = new ProjectInitFailureService(database.db);
	projectService.setInitFailureService(initFailureService);
	const settingsService = new SettingsService(effectiveConfig, getUserConfigPath());
	const directAiService = new DirectAiService(effectiveConfig);
	const telemetryService = new TelemetryService({
		commands: database.commands,
		db: database.db,
	});
	const metricsService = new MetricsService({
		dataDir: effectiveConfig.web.dataDir,
		db: database.db,
		getActiveConnections: () => webSocketHub.peerCount,
	});
	const retention = createRetentionScheduler(database.db, effectiveConfig.web.dataDir);
	await retention.run();
	const runService = new RunService(
		effectiveConfig,
		database.db,
		database.commands,
		webSocketHub,
		projectService,
		options.rootDir,
		telemetryService,
		retention.request,
	);
	projectService.setActiveRunSummaryProvider((paths) => runService.listActiveRunSummaries(paths));
	const { appLauncherService, appWatchdog } = createAppLauncher({
		db: database.db,
		hub: webSocketHub,
		projectService,
	});
	const {
		auditService,
		pipelineService,
		recipeService,
		scheduledTaskService,
		skillLaunchService,
		skillService,
	} = createExecutionServices({
		appWatchdog,
		config: effectiveConfig,
		database,
		hub: webSocketHub,
		projectService,
		rootDir: options.rootDir,
		runService,
		telemetryService,
	});
	const diaryService = new DiaryService({
		commands: database.commands,
		db: database.db,
		projectService,
		rootDir: options.rootDir,
	});
	const auditCatalogNames = await listProjectAuditCatalog(options.rootDir);
	projectService.setMaturityContext({
		auditCatalogDir: options.rootDir,
		auditCatalogNames,
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
	await appLauncherService.reconcileOnBoot();
	await runService.reconcileStaleRuns();
	await runService.ingestCompletedCliRuns();
	// Repair rows whose terminal heartbeat lacked exit/stop facts the ledger carries
	// (fill-NULL-only; also runs periodically on the ingest cadence).
	await runService.reconcileRunLedgerDrift().catch((error: unknown) => {
		webLogger.warn({ error }, 'Run ledger-drift reconcile failed at boot');
	});
	// Historical run backfills are fire-and-forget: git inspection must never delay boot, and
	// settings flags reduce each completed sweep to one SELECT on later starts.
	startOutcomeBackfills(database.db);
	await pipelineService.resumeStaleSessions();
	await sweepSessionMetricsAtBoot(database.db);
	await telemetryService.reconcileStaleInvocations();
	await metricsService.initialize();
	const directorService = new DirectorService(
		effectiveConfig,
		database.db,
		database.commands,
		webSocketHub,
		projectService,
		runService,
		createBackend,
		directAiService,
		{ pipelineService, recipeService },
	);
	// Must stay ahead of anything that can start a cycle: a resumed cycle's `running` row is what
	// the idle gate reads, so a scheduled occurrence claimed before this would see an idle fleet.
	await directorService.reconcileStaleCycles();
	await wireDirectorScheduling(effectiveConfig, scheduledTaskService, directorService);
	const telegramBridgeService = new TelegramBridgeService();
	const terminalSessionManager = new TerminalSessionManager({
		listShells: detectShells,
		rootDir: options.rootDir,
		spawnPty: await loadPtyProvider(),
	});
	let resolveExit: (code: number) => void = () => {};
	const exited = new Promise<number>((resolve) => {
		resolveExit = resolve;
	});
	let shuttingDown = false;
	const shutdown = async (reason: string): Promise<void> => {
		if (shuttingDown) return;
		shuttingDown = true;
		webLogger.info({ reason }, 'aidd web control panel shutting down');
		await telegramBridgeService.stop();
		// Detached children intentionally outlive web shutdown — markDisposed
		// only releases in-process watchers (run heartbeats) and the cycle
		// await loop. The CLI heartbeats keep advancing, and on the next
		// start reconcileStaleRuns + reconcileStaleCycles pick them up.
		runService.markDisposed();
		directorService.markDisposed();
		scheduledTaskService.dispose();
		// Terminal PTYs are the opposite of detached runs: they must never outlive this
		// process. Kill them before the listener drops so their output pumps stop first.
		terminalSessionManager.disposeAll();
		// Stop the metrics sampler/interval and flush the request counter before the DB closes.
		await metricsService.stop();
		stopBackendLogRotation();
		// Close the listener and force-drop active connections. The WebSocket hub
		// holds persistent peers that never drain on their own, so a graceful
		// app.stop() (no argument) would wait forever; passing true aborts them.
		// Awaiting this is what lets Bun release the socket cleanly — when this is
		// skipped (e.g. taskkill /F denies the signal), Windows abandons the socket
		// and leaves an orphaned port binding attributed to the dead PID. The
		// timeout guards against app.stop() itself hanging so teardown still runs.
		try {
			await Promise.race([app.stop(true), Bun.sleep(SHUTDOWN_TIMEOUT_MS)]);
		} catch (err) {
			webLogger.warn({ err }, 'app.stop() failed during shutdown; continuing teardown');
		}
		// Checkpoints the WAL, closes the connection, releases the writer lock, and
		// terminates the DB worker.
		await database.close();
		removeWebPidFile(options.rootDir);
		resolveExit(0);
	};
	const app = createWebServer({
		appLauncherService,
		auditService,
		config: effectiveConfig,
		database,
		diaryService,
		directAiService,
		directorService,
		initFailureService,
		metricsService,
		pipelineService,
		projectService,
		recipeService,
		requestRestart: (reason) => {
			if (!startRestartSupervisor(options.rootDir, effectiveConfig.web.port)) return false;
			setTimeout(() => void shutdown(`${reason}-restart`), SHUTDOWN_RESPONSE_FLUSH_MS);
			return true;
		},
		// Defer so the endpoint's 202 response flushes before the listener closes.
		requestShutdown: (reason) => {
			setTimeout(() => void shutdown(reason), SHUTDOWN_RESPONSE_FLUSH_MS);
		},
		rootDir: options.rootDir,
		runService,
		scheduledTaskService,
		settingsService,
		skillLaunchService,
		skillService,
		telegramBridgeService,
		telemetryService,
		terminalSessionManager,
		webSocketHub,
	});
	// Startup self-test: with allowRemote false, verify no public listener already owns the port.
	if (!webConfig.allowRemote) {
		const publicHost = await probePublicInterface(webConfig.hostname, webConfig.port, 500);
		if (publicHost) {
			await database.close();
			throw new Error(
				`Startup aborted: port ${webConfig.port} is already reachable on public interface ` +
					`${publicHost}. A public listener already exists. Stop the conflicting service ` +
					'or set web.allowRemote: true to acknowledge remote access.',
			);
		}
	}
	// Guard against serving a stale prebuilt UI: no start path rebuilds frontend/dist, so a
	// source-only change with a server restart would silently serve the old bundle. Warn loudly
	// (silent where frontend/src is absent, since the dist is then prebuilt and intended).
	await warnIfFrontendStale(options.rootDir);
	app.listen({ hostname: effectiveConfig.web.hostname, port: effectiveConfig.web.port });
	writeWebPidFile(options.rootDir);
	webLogger.info(
		{
			dataDir: effectiveConfig.web.dataDir,
			hostname: effectiveConfig.web.hostname,
			port: effectiveConfig.web.port,
			url: `http://${effectiveConfig.web.hostname}:${effectiveConfig.web.port}`,
		},
		'aidd web control panel started',
	);
	await telegramBridgeService.updateConfig(effectiveConfig);
	// Pre-warm the in-memory project listing cache so the first dashboard load
	// (which fans out to /projects and /director/fleet) hits warm entries
	// instead of paying the full ~N-project filesystem scan. Fire-and-forget: the
	// server is already accepting connections, and an early request joins the
	// in-flight per-project compute via the listing cache's pending map. Must run
	// after setMaturityContext/setAdvisor, which replace the cache instance.
	startSchedulesAfterProjectWarmup(projectService, scheduledTaskService);
	if (effectiveConfig.web.allowRemote) {
		warnRemoteAccess(effectiveConfig.web.hostname, effectiveConfig.web.port);
	}
	process.once('SIGINT', () => void shutdown('SIGINT'));
	process.once('SIGTERM', () => void shutdown('SIGTERM'));
	return await exited;
}
