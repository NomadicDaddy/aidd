import type { ResolvedWebConfig } from 'aidd-shared/config';
import type { WebSocketEvent } from 'aidd-shared/contracts/websocket';

import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import { buildAllowedOrigins } from '../originPolicy.ts';
import { bearerToken, isForwardedRequest, isPeerAuthorized } from '../plugins/bearerTokenGuard.ts';

/**
 * Authorizes a WebSocket upgrade. Browsers cannot set headers on the WS handshake, so the
 * token arrives as the `?token=` query param (see frontend useWebSocket and the HTTP
 * guard's WS_UPGRADE_PATH carve-out) — accept either the `Authorization` header or the
 * query token. Like the HTTP guard, a forwarded (reverse-proxied) upgrade cannot use the
 * loopback exemption and must present a valid token.
 * @param web - Resolved web config (only `authToken` is consulted).
 * @param upgrade - The upgrade peer address, headers, and parsed query.
 * @returns True when the upgrade is allowed.
 */
export function isWebSocketUpgradeAuthorized(
	web: Pick<ResolvedWebConfig, 'allowRemote' | 'authToken'>,
	upgrade: {
		headers: Record<string, string | undefined>;
		query?: Record<string, string | undefined> | undefined;
		remoteAddress?: null | string;
	},
): boolean {
	const queryToken = typeof upgrade.query?.token === 'string' ? upgrade.query.token : undefined;
	const providedToken = bearerToken(upgrade.headers.authorization) ?? queryToken;
	return isPeerAuthorized(
		web,
		upgrade.remoteAddress ?? null,
		providedToken,
		isForwardedRequest(upgrade.headers),
	);
}

export function createWebSocketRoutes(context: WebContext) {
	const web = context.config.web;
	const allowedOrigins = web ? buildAllowedOrigins(web) : new Set<string>();

	return new Elysia({ prefix: '/api/v1' }).ws('/ws', {
		close(ws) {
			context.webSocketHub.remove(ws.id);
		},
		message(ws, message) {
			ws.send(JSON.stringify({ payload: message, type: 'ack' } satisfies WebSocketEvent));
		},
		open(ws) {
			const origin = ws.data.headers.origin;
			if (!web) {
				ws.close(1011, 'web config missing');
				return;
			}
			// Authoritative WS token gate (mirrors the origin check below): the global
			// onBeforeHandle guard may not fire for ws upgrades, so enforce here too.
			if (
				!isWebSocketUpgradeAuthorized(web, {
					headers: ws.data.headers,
					query: ws.data.query as Record<string, string | undefined> | undefined,
					remoteAddress: ws.remoteAddress,
				})
			) {
				ws.close(1008, 'unauthorized');
				return;
			}
			if (origin && !allowedOrigins.has(origin)) {
				ws.close(1008, 'origin not allowed');
				return;
			}
			const accepted = context.webSocketHub.add(ws, ws.id);
			if (!accepted) {
				ws.close(1013, 'server at peer capacity');
				return;
			}
			ws.send(
				JSON.stringify({
					payload: { connected: true },
					type: 'connected',
				} satisfies WebSocketEvent),
			);
		},
	});
}
