import { Elysia } from 'elysia';
import { join } from 'node:path';

import type { WebContext } from './context.ts';

import { createBearerTokenGuardPlugin } from './plugins/bearerTokenGuard.ts';
import { dataMovementTracePlugin } from './plugins/dataMovementTrace.ts';
import { errorHandlerPlugin } from './plugins/errorHandler.ts';
import { createRemoteOriginGuardPlugin } from './plugins/remoteOriginGuard.ts';
import { requestIdPlugin } from './plugins/requestId.ts';
import { securityHeadersPlugin } from './plugins/securityHeaders.ts';
import { createAdminRoutes } from './routes/admin.ts';
import { createAppLauncherRoutes } from './routes/appLauncher.ts';
import { createAuditsRoutes } from './routes/audits.ts';
import { createDiaryRoutes } from './routes/diary.ts';
import { createDirectorRoutes } from './routes/director.ts';
import { createHealthRoutes } from './routes/health.ts';
import { createLaunchDefaultsRoutes } from './routes/launchDefaults.ts';
import { createPipelineSessionsRoutes } from './routes/pipelineSessions.ts';
import { createProjectCodeRoutes } from './routes/projectCode.ts';
import { createProjectFeatureRoutes } from './routes/projectFeatures.ts';
import { createProjectInitFailureRoutes } from './routes/projectInitFailures.ts';
import { createProjectMaturityRoutes } from './routes/projectMaturity.ts';
import { createProjectMilestoneRoutes } from './routes/projectMilestones.ts';
import { createProjectNotesRoutes } from './routes/projectNotes.ts';
import { createProjectsRoutes } from './routes/projects.ts';
import { createProjectWorkingTreeRoutes } from './routes/projectWorkingTree.ts';
import { createRecipesRoutes } from './routes/recipes.ts';
import { createRunsRoutes } from './routes/runs.ts';
import { createScheduledTaskRoutes } from './routes/scheduledTasks.ts';
import { createSettingsRoutes } from './routes/settings.ts';
import { createSkillsRoutes } from './routes/skills.ts';
import { createSystemRoutes } from './routes/system.ts';
import { createTelemetryRoutes } from './routes/telemetry.ts';
import { createTerminalRoutes } from './routes/terminal.ts';
import { createWebSocketRoutes } from './routes/ws.ts';
import { serveStaticFile } from './staticAssets.ts';

export function createWebServer(context: WebContext) {
	const distDir = join(context.rootDir, 'frontend', 'dist');
	const traceDefault = () => context.config.web?.traceDataMovement ?? false;
	// Single-operator listener: CORS, rate-limit, and CSRF plugins are intentionally omitted.
	// The default bind is loopback, but web.allowRemote lifts that, so the boundary is enforced by
	// the always-mounted bearer-token guard plus the origin guard below rather than by binding
	// alone. Request-id (which also emits the per-request pino log) and baseline security headers
	// apply to every request.
	return (
		new Elysia()
			.use(errorHandlerPlugin)
			.use(requestIdPlugin)
			.use(securityHeadersPlugin)
			.use(dataMovementTracePlugin)
			// Always mounted: the guard allows direct loopback callers without a token but
			// denies forwarded (reverse-proxied) requests unless they present a configured
			// token. Mounting it only when a token is set would leave proxied requests
			// entirely ungated. See bearerTokenGuard.ts.
			.use(createBearerTokenGuardPlugin(context.config.web ?? { allowRemote: false }))
			.use(
				context.config.web?.allowRemote
					? createRemoteOriginGuardPlugin(context.config.web)
					: new Elysia(),
			)
			.use(createHealthRoutes())
			.use(createAdminRoutes(context))
			.use(createAuditsRoutes(context))
			.use(createAppLauncherRoutes(context))
			.use(createProjectsRoutes(context))
			.use(createProjectCodeRoutes(context))
			.use(createProjectNotesRoutes(context))
			.use(createProjectWorkingTreeRoutes(context))
			.use(createProjectFeatureRoutes(context))
			.use(createProjectInitFailureRoutes(context))
			.use(createProjectMaturityRoutes(context))
			.use(createProjectMilestoneRoutes(context))
			.use(createRunsRoutes(context))
			.use(createScheduledTaskRoutes(context))
			.use(createDiaryRoutes(context))
			.use(createDirectorRoutes(context))
			.use(createSkillsRoutes(context))
			.use(createLaunchDefaultsRoutes(context))
			.use(createRecipesRoutes(context))
			.use(createPipelineSessionsRoutes(context))
			// warmStatusCache probes the installed CLIs once at boot, off the request path,
			// so the first Settings visit does not wait on the subprocess fleet.
			.use(createSettingsRoutes(context, { warmStatusCache: true }))
			.use(createTelemetryRoutes(context))
			.use(createSystemRoutes(context))
			.use(createTerminalRoutes(context))
			.use(createWebSocketRoutes(context))
			.get('/assets/*', ({ request }) =>
				serveStaticFile(
					distDir,
					new URL(request.url).pathname,
					traceDefault(),
					request.headers.get('accept-encoding'),
					request.headers.get('if-none-match'),
				),
			)
			.get('/', ({ request }) =>
				serveStaticFile(
					distDir,
					'index.html',
					traceDefault(),
					request.headers.get('accept-encoding'),
					request.headers.get('if-none-match'),
					{ fallbackToIndex: true },
				),
			)
			.get('/*', ({ request, set }) => {
				const path = new URL(request.url).pathname;
				if (path.startsWith('/api/')) {
					set.status = 404;
					return { error: 'Not found' };
				}
				return serveStaticFile(
					distDir,
					path,
					traceDefault(),
					request.headers.get('accept-encoding'),
					request.headers.get('if-none-match'),
					{ fallbackToIndex: true },
				);
			})
	);
}
