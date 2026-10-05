import { Elysia } from 'elysia';
import { join } from 'node:path';

import type { WebContext } from './context.ts';

import { buildAllowedOrigins, buildTrustedRequestHost } from './originPolicy.ts';
import { createBearerTokenGuardPlugin } from './plugins/bearerTokenGuard.ts';
import { dataMovementTracePlugin } from './plugins/dataMovementTrace.ts';
import { errorHandlerPlugin } from './plugins/errorHandler.ts';
import { createOriginGuardPlugin } from './plugins/originGuard.ts';
import { requestIdPlugin } from './plugins/requestId.ts';
import { securityHeadersPlugin } from './plugins/securityHeaders.ts';
import { createAdminRoutes } from './routes/admin.ts';
import { createAppLauncherRoutes } from './routes/appLauncher.ts';
import { createAuditsRoutes } from './routes/audits.ts';
import { createDiaryRoutes } from './routes/diary.ts';
import { createDirectorRoutes } from './routes/director.ts';
import { createHealthRoutes } from './routes/health.ts';
import { createLaunchDefaultsRoutes } from './routes/launchDefaults.ts';
import { createNavCountsRoutes } from './routes/navCounts.ts';
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
	// Single-operator listener: CORS and rate-limit plugins are intentionally omitted. Binding to
	// loopback is not a boundary on its own: a page in the operator's browser can reach 127.0.0.1
	// by DNS rebinding (same-origin, foreign Host) or by a cross-origin simple request (foreign
	// Origin). Both guards below are therefore mounted for every panel: the bearer guard grants
	// token-free loopback access only to a trusted Host, and the origin guard refuses a foreign
	// Origin. Request-id (which also emits the per-request pino log) and baseline security headers
	// apply to every request.
	return (
		new Elysia()
			.use(errorHandlerPlugin)
			.use(requestIdPlugin)
			.use(securityHeadersPlugin)
			.use(dataMovementTracePlugin)
			// Always mounted: the guard allows direct loopback callers that name a trusted Host
			// without a token, but denies forwarded (reverse-proxied) requests and foreign Hosts
			// unless they present a configured token. See bearerTokenGuard.ts.
			.use(
				createBearerTokenGuardPlugin(
					context.config.web ?? { allowRemote: false },
					buildTrustedRequestHost(context.config.web),
				),
			)
			.use(
				createOriginGuardPlugin(
					context.config.web ? buildAllowedOrigins(context.config.web) : new Set(),
				),
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
			.use(createNavCountsRoutes(context))
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
