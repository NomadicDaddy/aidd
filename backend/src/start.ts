import { createBackend } from 'aidd-shared/backends/factory';
import { getUserConfigPath, type ResolvedConfig, type ResolvedWebConfig } from 'aidd-shared/config';
import { setAiCallLogDir } from 'aidd-shared/lib/aiCallLog';
import { resolve } from 'node:path';

import { createWorkerWebDatabase } from './db/client.ts';
import { warnIfFrontendStale } from './frontendStaleness.ts';
import { webLogger } from './logger.ts';
import { createWebServer } from './server.ts';
import { AppLauncherService } from './services/appLauncher/launcher.ts';
import { AuditService } from './services/auditService.ts';
import { DiaryService } from './services/diaryService.ts';
import { DirectAiService } from './services/directAiService.ts';
import { DirectorService } from './services/directorService.ts';
import { listProjectAuditCatalog } from './services/maturityCompute.ts';
import { MetricsService } from './services/metricsService.ts';
import { PipelineService } from './services/pipelineService.ts';
import { ProjectInitFailureService } from './services/project/initFailureService.ts';
import { ProjectService } from './services/projectService.ts';
import { RecipeService } from './services/recipeService.ts';
import { backfillRunOutputMetrics } from './services/run/outputMetricsBackfill.ts';
import { RunService } from './services/runService.ts';
import { SettingsService } from './services/settingsService.ts';
import { SkillService } from './services/skillService.ts';
import { TelegramBridgeService } from './services/telegramBridgeService.ts';
import { TelemetryService } from './services/telemetryService.ts';
import { loadPtyProvider } from './services/terminal/ptyProvider.ts';
import { TerminalSessionManager } from './services/terminal/sessionManager.ts';
import { detectShells } from './services/terminal/shellDetection.ts';
import {
	installProcessSafetyNet,
	probePublicInterface,
	removeWebPidFile,
	resolveEffectiveWebConfig,
	startRestartSupervisor,
	warnRemoteAccess,
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
	const webConfig = resolveEffectiveWebConfig(config, options.rootDir);
	const effectiveConfig = { ...config, web: webConfig };
	installProcessSafetyNet();
	// Enforce the single-writer invariant: createWebDatabase acquires the writer lock before it
	// opens the connection, so a second backend pointed at the same data directory is rejected
	// before it can establish a write-capable handle. Throws here if another live backend owns it.
	// The worker acquires the single-writer lock and runs migrations during init; it throws here
	// if another live backend already owns the database, preserving the fail-fast invariant.
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
	const runService = new RunService(
		effectiveConfig,
		database.db,
		database.commands,
		webSocketHub,
		projectService,
		options.rootDir,
		telemetryService,
	);
	projectService.setActiveRunSummaryProvider((paths) => runService.listActiveRunSummaries(paths));
	const recipeService = new RecipeService(options.rootDir, effectiveConfig.web.dataDir);
	const skillService = new SkillService({
		allowedRoots: effectiveConfig.web.allowedRoots,
		dataDir: effectiveConfig.web.dataDir,
		rootDir: options.rootDir,
	});
	const diaryService = new DiaryService({
		commands: database.commands,
		db: database.db,
		projectService,
		rootDir: options.rootDir,
	});
	const auditService = new AuditService(
		effectiveConfig,
		projectService,
		runService,
		options.rootDir,
	);
	const pipelineService = new PipelineService({
		db: database.db,
		hub: webSocketHub,
		projectService,
		recipeService,
		runService,
		skillService,
		telemetryService,
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
	const appLauncherService = new AppLauncherService({
		db: database.db,
		hub: webSocketHub,
		projectService,
	});
	await appLauncherService.reconcileOnBoot();
	await runService.reconcileStaleRuns();
	await runService.ingestCompletedCliRuns();
	// Repair rows whose terminal heartbeat lacked exit/stop facts the ledger carries
	// (fill-NULL-only; also runs periodically on the ingest cadence).
	await runService.reconcileRunLedgerDrift().catch((error: unknown) => {
		webLogger.warn({ error }, 'Run ledger-drift reconcile failed at boot');
	});
	// One-shot output-metrics backfill for pre-capture runs. Fire-and-forget: it can spawn a
	// git numstat per historical commit, which must never delay boot; after the first pass a
	// settings flag reduces it to a single SELECT.
	void backfillRunOutputMetrics(database.db).catch((error: unknown) => {
		webLogger.warn({ error }, 'Run output-metrics backfill failed');
	});
	await pipelineService.resumeStaleSessions();
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
	await directorService.reconcileStaleCycles();
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
		// Terminal PTYs are the opposite of detached runs: they must never outlive this
		// process. Kill them before the listener drops so their output pumps stop first.
		terminalSessionManager.disposeAll();
		// Stop the metrics sampler/interval and flush the request counter before the DB closes.
		await metricsService.stop();
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
		settingsService,
		skillService,
		telegramBridgeService,
		telemetryService,
		terminalSessionManager,
		webSocketHub,
	});
	// Startup self-test: if allowRemote is false, verify no public listener already
	// accepts connections on the configured port.
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
	// (silent on the standalone artifact path, where frontend/src is absent and dist is intended).
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
	void projectService
		.listProjectListings()
		.then(() => {
			// Begin the director auto-cycle scheduler only after the project listing
			// is warm: the startup catch-up cycle reads the fleet summary (which fans out
			// across projects), so deferring it keeps boot-time work from contending and
			// ensures "warmed up" before the first automatic cycle can fire.
			directorService.startScheduler();
		})
		.catch((err) => webLogger.warn({ err }, 'project listing warm-up failed'));
	if (effectiveConfig.web.allowRemote) {
		warnRemoteAccess(effectiveConfig.web.hostname, effectiveConfig.web.port);
	}
	process.once('SIGINT', () => void shutdown('SIGINT'));
	process.once('SIGTERM', () => void shutdown('SIGTERM'));
	return await exited;
}
