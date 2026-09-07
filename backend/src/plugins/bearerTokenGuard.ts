import type { ResolvedWebConfig } from 'aidd-shared/config';

import { isLoopbackHostname } from 'aidd-shared';
import { Elysia } from 'elysia';
import { timingSafeEqual } from 'node:crypto';

/**
 * Inbound bearer-token guard.
 *
 * Always mounted (see server.ts wiring). It gates `/api/*` (which includes the
 * `/api/v1/ws` upgrade). A direct same-machine caller — the local browser UI, local
 * MCP/bridge — connects over loopback with no forwarding headers and is allowed without
 * a token; every other caller must present `Authorization: Bearer <token>`.
 *
 * Crucially, the loopback exemption is voided for FORWARDED requests (those carrying
 * `X-Forwarded-*` / `Forwarded` / `X-Real-IP`). Behind a reverse proxy (e.g. Caddy) the
 * transport peer is always the proxy on loopback, so a naive loopback exemption would
 * trust the entire network the proxy fronts. A forwarded request must therefore present
 * a valid token, and if no token is configured it is denied — you cannot safely expose
 * an unauthenticated control plane through a proxy. To serve the UI through a proxy, set
 * `web.authToken` (the browser UI and clients attach it automatically).
 *
 * A panel with no token configured at all is the default local setup and stays open to
 * direct callers — but only while it is loopback-bound. With `web.allowRemote` set and no
 * token, the same panel would answer the network unauthenticated, so it is held to loopback
 * peers instead. `assertWebAuthTokenPresent` (startHelpers.ts) stops that configuration from
 * binding in the first place; this is the second line, for a config that arrives some other way.
 *
 * Query-string tokens (`?token=`) are accepted ONLY for the `/api/v1/ws` upgrade,
 * where browsers cannot set request headers on the WebSocket handshake. Every other
 * `/api/` request must use the `Authorization` header: query-string tokens leak more
 * readily through browser history, proxies, and access logs.
 */

/** True for `127.0.0.0/8`, `::1`, and IPv4-mapped loopback (`::ffff:127.0.0.1`). */
export function isLoopbackAddress(address: string): boolean {
	return isLoopbackHostname(address.replace(/^::ffff:/i, ''));
}

function tokensMatch(provided: null | string | undefined, expected: string): boolean {
	if (!provided) return false;
	const providedBytes = Buffer.from(provided);
	const expectedBytes = Buffer.from(expected);
	if (providedBytes.length !== expectedBytes.length) return false;
	return timingSafeEqual(providedBytes, expectedBytes);
}

/** The only `/api/` paths allowed to authenticate via a `?token=` query string (WS upgrades). */
const WS_UPGRADE_PATHS = new Set(['/api/v1/terminal/ws', '/api/v1/ws']);

/**
 * Headers a reverse proxy adds when it forwards a request. Their presence is proof the
 * request did not originate from a direct local connection, so the loopback exemption
 * must not apply. We never trust their VALUES (those are spoofable) — only that the
 * request was proxied at all.
 */
const FORWARDING_HEADER_NAMES = [
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
	'x-real-ip',
	'forwarded',
];

/** Reads a header from either a Fetch `Headers` instance or a plain lowercased-key record. */
function readHeader(
	headers: Headers | Record<string, string | undefined> | undefined,
	name: string,
): string | undefined {
	if (!headers) return undefined;
	if (typeof (headers as Headers).get === 'function') {
		return (headers as Headers).get(name) ?? undefined;
	}
	return (headers as Record<string, string | undefined>)[name];
}

/** True when the request carries any reverse-proxy forwarding header. */
export function isForwardedRequest(
	headers: Headers | Record<string, string | undefined> | undefined,
): boolean {
	return FORWARDING_HEADER_NAMES.some((name) => {
		const value = readHeader(headers, name);
		return value !== undefined && value !== '';
	});
}

/** Extracts the token from an `Authorization: Bearer <token>` header value. */
export function bearerToken(authorizationHeader: null | string | undefined): string | undefined {
	if (!authorizationHeader) return undefined;
	const captured = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim())?.[1];
	return captured !== undefined ? captured.trim() : undefined;
}

/**
 * Shared authorization predicate, reused by the HTTP guard and the WS `open()` handler.
 *
 * `requestIsForwarded` must be true when the request carries reverse-proxy headers
 * (see {@link isForwardedRequest}). A forwarded request can never use the loopback
 * shortcut, so it must present a matching token — and is denied outright if no token
 * is configured.
 */
export function isPeerAuthorized(
	web: Pick<ResolvedWebConfig, 'allowRemote' | 'authToken'>,
	peerAddress: null | string | undefined,
	providedToken: null | string | undefined,
	requestIsForwarded: boolean,
): boolean {
	if (requestIsForwarded) {
		return web.authToken ? tokensMatch(providedToken, web.authToken) : false;
	}
	if (!web.authToken) {
		// A loopback-only panel has no token to check and never leaves the machine, so this stays
		// open: it is the default local configuration, and a peer address is not always knowable
		// (`server.requestIP` returns nothing when the app is driven without a listening server).
		// A remote-bound panel with no token is a different thing entirely -- it would answer the
		// network unauthenticated -- so it is held to loopback. `assertWebAuthTokenPresent` stops
		// that panel from binding at all; this is the second line, for a config that reaches the
		// guard some other way.
		if (!web.allowRemote) return true;
		return Boolean(peerAddress && isLoopbackAddress(peerAddress));
	}
	if (peerAddress && isLoopbackAddress(peerAddress)) return true;
	return tokensMatch(providedToken, web.authToken);
}

export function createBearerTokenGuardPlugin(
	webConfig: Pick<ResolvedWebConfig, 'allowRemote' | 'authToken'>,
) {
	return new Elysia({ name: 'bearer-token-guard' }).onBeforeHandle(
		{ as: 'global' },
		({ request, server, set }) => {
			const url = new URL(request.url);
			if (!url.pathname.startsWith('/api/')) return;
			const peerAddress = server?.requestIP(request)?.address ?? null;
			const headerToken = bearerToken(request.headers.get('authorization'));
			const queryToken = WS_UPGRADE_PATHS.has(url.pathname)
				? url.searchParams.get('token')
				: null;
			const providedToken = headerToken ?? queryToken;
			if (
				isPeerAuthorized(
					webConfig,
					peerAddress,
					providedToken,
					isForwardedRequest(request.headers),
				)
			) {
				return;
			}
			set.status = 401;
			return { error: 'Unauthorized' };
		},
	);
}
