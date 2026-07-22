import type { TerminalClientFrame, TerminalServerFrame } from 'aidd-shared/contracts/terminal';

import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';
import type { TerminalAttachment } from '../services/terminal/sessionManager.ts';

import { webLogger } from '../logger.ts';
import { buildAllowedOrigins } from '../originPolicy.ts';
import {
	TerminalLimitError,
	TerminalSpawnError,
	TerminalUnavailableError,
} from '../services/terminal/sessionManager.ts';
import { isWebSocketUpgradeAuthorized } from './ws.ts';

function parseClientFrame(raw: unknown): null | TerminalClientFrame {
	// Elysia may hand the message over pre-parsed (object) or as the raw string.
	const value = typeof raw === 'string' ? safeJsonParse(raw) : raw;
	if (!value || typeof value !== 'object') return null;
	const frame = value as Record<string, unknown>;
	if (frame.type === 'input' && typeof frame.data === 'string') {
		return { data: frame.data, type: 'input' };
	}
	if (
		frame.type === 'resize' &&
		typeof frame.cols === 'number' &&
		typeof frame.rows === 'number'
	) {
		return { cols: frame.cols, rows: frame.rows, type: 'resize' };
	}
	if (frame.type === 'ack' && typeof frame.chars === 'number') {
		return { chars: frame.chars, type: 'ack' };
	}
	if (frame.type === 'ping') return { type: 'ping' };
	return null;
}

function safeJsonParse(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

/**
 * REST + WebSocket surface for the embedded terminal pane. REST manages session lifecycle
 * (detected shells, get-or-create, kill); the socket carries the interactive byte streams.
 * Unlike `/api/v1/ws` (broadcast hub), each terminal socket is attached to one PTY session and
 * receives frames via its own per-connection send — the hub is not involved.
 */
export function createTerminalRoutes(context: WebContext) {
	const manager = context.terminalSessionManager;
	const web = context.config.web;
	const allowedOrigins = web ? buildAllowedOrigins(web) : new Set<string>();
	// ws.id -> the attachment registered with the session manager, so close() can detach it.
	const attachments = new Map<string, { attachment: TerminalAttachment; sessionId: string }>();

	return new Elysia({ prefix: '/api/v1' })
		.get('/terminal/shells', ({ set }) => {
			if (!manager.available) {
				set.status = 503;
				return { error: 'terminal support unavailable on this host' };
			}
			return { shells: manager.listShells() };
		})
		.get('/terminal/sessions', () => ({ sessions: manager.listSessions() }))
		.post(
			'/terminal/sessions',
			({ body, set }) => {
				try {
					return manager.create({
						...(body?.cwd ? { cwd: body.cwd } : {}),
						...(body?.shellId ? { shellId: body.shellId } : {}),
					});
				} catch (err) {
					if (err instanceof TerminalUnavailableError) {
						set.status = 503;
						return { error: err.message };
					}
					if (err instanceof TerminalLimitError) {
						set.status = 409;
						return { error: err.message };
					}
					if (err instanceof TerminalSpawnError) {
						set.status = 400;
						return { error: err.message };
					}
					throw err;
				}
			},
			{
				body: t.Optional(
					t.Object({ cwd: t.Optional(t.String()), shellId: t.Optional(t.String()) })
				),
			}
		)
		.delete('/terminal/sessions/:sessionId', ({ params, set }) => {
			if (!manager.kill(params.sessionId)) {
				set.status = 404;
				return { error: 'session not found' };
			}
			return { ok: true };
		})
		.ws('/terminal/ws', {
			close(ws) {
				const entry = attachments.get(ws.id);
				if (!entry) return;
				attachments.delete(ws.id);
				// Detach only — the PTY session deliberately survives socket loss so the pane
				// can reattach after a page reload.
				manager.detach(entry.sessionId, entry.attachment);
			},
			message(ws, raw) {
				const entry = attachments.get(ws.id);
				if (!entry) return;
				const frame = parseClientFrame(raw);
				if (!frame) {
					webLogger.debug({ wsId: ws.id }, 'terminal ws: ignoring malformed frame');
					return;
				}
				if (frame.type === 'input') {
					manager.write(entry.sessionId, frame.data);
				} else if (frame.type === 'resize') {
					manager.resize(entry.sessionId, frame.cols, frame.rows);
				} else if (frame.type === 'ack') {
					manager.ack(entry.sessionId, entry.attachment, frame.chars);
				} else {
					entry.attachment.send({ type: 'pong' });
				}
			},
			open(ws) {
				const origin = ws.data.headers.origin;
				if (!web) {
					ws.close(1011, 'web config missing');
					return;
				}
				// Same gate as the broadcast socket: the HTTP guard may not run for upgrades,
				// so the token/origin checks are enforced here too.
				if (
					!isWebSocketUpgradeAuthorized(web, {
						headers: ws.data.headers,
						query: ws.data.query as Record<string, string | undefined> | undefined,
						remoteAddress: ws.remoteAddress,
					})
				) {
					ws.close(1008, 'not allowed');
					return;
				}
				if (origin && !allowedOrigins.has(origin)) {
					ws.close(1008, 'origin not allowed');
					return;
				}
				const query = ws.data.query as Record<string, string | undefined> | undefined;
				const sessionId = typeof query?.session === 'string' ? query.session : '';
				const attachment: TerminalAttachment = {
					send: (frame: TerminalServerFrame) => ws.send(JSON.stringify(frame)),
				};
				const hello = manager.attach(sessionId, attachment);
				if (!hello) {
					attachment.send({
						code: 'session-not-found',
						message:
							'terminal session not found; create one via POST /terminal/sessions',
						type: 'error',
					});
					ws.close(1008, 'session not found');
					return;
				}
				attachments.set(ws.id, { attachment, sessionId });
				attachment.send(hello);
			},
		});
}
