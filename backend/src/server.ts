import { Elysia } from 'elysia';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { WebContext } from './context.ts';

import { pathIsInside } from './paths.ts';
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
import { createProjectNotesRoutes } from './routes/projectNotes.ts';
import { createProjectsRoutes } from './routes/projects.ts';
import { createRecipesRoutes } from './routes/recipes.ts';
import { createRunsRoutes } from './routes/runs.ts';
import { createSettingsRoutes } from './routes/settings.ts';
import { createSkillsRoutes } from './routes/skills.ts';
import { createSystemRoutes } from './routes/system.ts';
import { createTelemetryRoutes } from './routes/telemetry.ts';
import { createTerminalRoutes } from './routes/terminal.ts';
import { createWebSocketRoutes } from './routes/ws.ts';
import {
	cacheControlFor,
	compressOnce,
	compressed,
	contentTypeFor,
	isCompressible,
	negotiateEncoding,
} from './staticAssets.ts';

type StaticFileOptions = {
	fallbackToIndex?: boolean;
};

/**
 * Apply the negotiated content encoding, falling back to the unencoded body when the client
 * accepts nothing we speak, the payload is too small or already compressed, or compression
 * failed to shrink it. `Vary` is set whenever the body was eligible, so a shared cache never
 * serves an encoded payload to a client that cannot read it.
 */
function encodedResponse(
	bytes: Uint8Array<ArrayBuffer>,
	contentType: string,
	cacheControl: null | string,
	acceptEncoding: null | string,
	identity: string
): Response {
	const headers = new Headers({ 'content-type': contentType });
	if (cacheControl) headers.set('Cache-Control', cacheControl);
	if (!isCompressible(contentType, bytes.byteLength)) {
		return new Response(bytes, { headers });
	}
	headers.set('Vary', 'Accept-Encoding');
	const encoding = negotiateEncoding(acceptEncoding);
	const payload = encoding ? compressed(encoding, bytes, identity) : null;
	if (!encoding || !payload) {
		return new Response(bytes, { headers });
	}
	headers.set('Content-Encoding', encoding);
	return new Response(payload, { headers });
}

async function serveStaticFile(
	distDir: string,
	path: string,
	traceDefault: boolean,
	acceptEncoding: null | string,
	options: StaticFileOptions = {}
): Promise<Response> {
	const relativePath = path.replace(/^\/+/, '') || 'index.html';
	const candidate = resolve(distDir, relativePath);
	const candidateExists = pathIsInside(distDir, candidate) && existsSync(candidate);
	if (!candidateExists && options.fallbackToIndex !== true) {
		return new Response('Not found', {
			headers: { 'content-type': 'text/plain; charset=utf-8' },
			status: 404,
		});
	}
	const target = candidateExists ? candidate : join(distDir, 'index.html');
	const contentType = contentTypeFor(target);
	// Policy follows the served URL, not the resolved file: an unknown path that falls back to
	// index.html must not inherit the caching of the path that was requested.
	const servedPath = candidateExists ? path : '/index.html';
	const cacheControl = cacheControlFor(servedPath, contentType);
	const file = Bun.file(target);
	if (contentType.startsWith('text/html')) {
		const html = await file.text();
		const bootstrap = `<meta name="aidd-trace-default" content="${traceDefault ? 'true' : 'false'}" />`;
		const injected = html.includes('</head>')
			? html.replace('</head>', `\t\t${bootstrap}\n\t</head>`)
			: `${bootstrap}${html}`;
		// The injected marker varies with config, so this body is not the file on disk and is
		// deliberately not memoised.
		const bytes = new TextEncoder().encode(injected);
		const headers = new Headers({ 'content-type': contentType, Vary: 'Accept-Encoding' });
		const encoding = negotiateEncoding(acceptEncoding);
		if (!encoding || !isCompressible(contentType, bytes.byteLength)) {
			return new Response(bytes, { headers });
		}
		headers.set('Content-Encoding', encoding);
		return new Response(compressOnce(encoding, bytes), { headers });
	}
	const stats = statSync(target);
	const identity = `${target}:${stats.mtimeMs}:${stats.size}`;
	const bytes = new Uint8Array(await file.arrayBuffer());
	return encodedResponse(bytes, contentType, cacheControl, acceptEncoding, identity);
}

export function createWebServer(context: WebContext) {
	const distDir = join(context.rootDir, 'frontend', 'dist');
	const traceDefault = () => context.config.web?.traceDataMovement ?? false;
	// Loopback-only listener (enforced by hostname binding in start.ts): CORS, rate-limit, and CSRF plugins are intentionally omitted; only request-id (which also emits the per-request pino log) and baseline security headers are applied.
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
			.use(createBearerTokenGuardPlugin(context.config.web ?? {}))
			.use(
				context.config.web?.allowRemote
					? createRemoteOriginGuardPlugin(context.config.web)
					: new Elysia()
			)
			.use(createHealthRoutes())
			.use(createAdminRoutes(context))
			.use(createAuditsRoutes(context))
			.use(createAppLauncherRoutes(context))
			.use(createProjectsRoutes(context))
			.use(createProjectCodeRoutes(context))
			.use(createProjectNotesRoutes(context))
			.use(createProjectFeatureRoutes(context))
			.use(createProjectInitFailureRoutes(context))
			.use(createProjectMaturityRoutes(context))
			.use(createRunsRoutes(context))
			.use(createDiaryRoutes(context))
			.use(createDirectorRoutes(context))
			.use(createSkillsRoutes(context))
			.use(createLaunchDefaultsRoutes(context))
			.use(createRecipesRoutes(context))
			.use(createPipelineSessionsRoutes(context))
			.use(createSettingsRoutes(context))
			.use(createTelemetryRoutes(context))
			.use(createSystemRoutes(context))
			.use(createTerminalRoutes(context))
			.use(createWebSocketRoutes(context))
			.get('/assets/*', ({ request }) =>
				serveStaticFile(
					distDir,
					new URL(request.url).pathname,
					traceDefault(),
					request.headers.get('accept-encoding')
				)
			)
			.get('/', ({ request }) =>
				serveStaticFile(
					distDir,
					'index.html',
					traceDefault(),
					request.headers.get('accept-encoding'),
					{ fallbackToIndex: true }
				)
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
					{ fallbackToIndex: true }
				);
			})
	);
}
