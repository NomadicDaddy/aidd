import { afterEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import type { WebContext } from '../../backend/src/context.ts';

import { createWebSocketRoutes } from '../../backend/src/routes/ws.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';

const TOKEN = 'ws-open-handler-token';
const ALLOWED_ORIGIN = 'http://allowed.example';

// audit-testing-1790882994: the open handler is the authoritative token and origin gate for the
// broadcast socket, and no test had ever driven it. These connect a real client to a listening
// server so the close codes it answers with are the ones a browser would see.
let stopServer: (() => void) | null = null;

function listen(hub: WebSocketHub): { port: number } {
	const context = {
		config: {
			web: {
				allowedOrigins: [ALLOWED_ORIGIN],
				allowRemote: true,
				authToken: TOKEN,
				hostname: '127.0.0.1',
				port: 3210,
			},
		},
		webSocketHub: hub,
	} as unknown as WebContext;
	const app = new Elysia()
		.use(createWebSocketRoutes(context))
		.listen({ hostname: '127.0.0.1', port: 0 });
	stopServer = () => {
		app.stop(true);
	};
	const port = app.server?.port;
	if (port === undefined) throw new Error('listen did not bind a port');
	return { port };
}

// The server's close handler runs after the client has already seen the close event.
async function settledPeerCount(hub: WebSocketHub): Promise<number> {
	for (let i = 0; i < 50 && hub.peerCount > 0; i++) await Bun.sleep(10);
	return hub.peerCount;
}

interface Closed {
	code: number;
	reason: string;
}

// Bun's WebSocket client accepts handshake headers as a constructor option, which the DOM typing
// of the global does not declare; a browser cannot set them, a test must.
const BunWebSocket = WebSocket as unknown as new (
	url: string,
	options: { headers: Record<string, string> },
) => WebSocket;

// Opens a socket and resolves on close with the server's close code; `frames` collects every
// message received before that.
function connect(
	url: string,
	headers: Record<string, string>,
	onOpen?: (socket: WebSocket) => void,
): Promise<{ closed: Closed; frames: unknown[] }> {
	return new Promise((resolve, reject) => {
		const frames: unknown[] = [];
		const socket = new BunWebSocket(url, { headers });
		socket.addEventListener('message', (event) => {
			frames.push(JSON.parse(String(event.data)));
		});
		socket.addEventListener('close', (event) => {
			resolve({ closed: { code: event.code, reason: event.reason }, frames });
		});
		socket.addEventListener('error', () => reject(new Error('socket errored')));
		if (onOpen) socket.addEventListener('open', () => onOpen(socket));
	});
}

afterEach(() => {
	stopServer?.();
	stopServer = null;
});

describe('broadcast WebSocket open handler', () => {
	test('a forwarded upgrade with no token is closed 1008 and never joins the hub', async () => {
		const hub = new WebSocketHub();
		const { port } = listen(hub);

		const { closed } = await connect(`ws://127.0.0.1:${port}/api/v1/ws`, {
			'x-forwarded-for': '100.64.1.2',
		});

		expect(closed).toEqual({ code: 1008, reason: 'unauthorized' });
		expect(hub.peerCount).toBe(0);
	});

	test('a valid token with a disallowed Origin is closed 1008 origin not allowed', async () => {
		const hub = new WebSocketHub();
		const { port } = listen(hub);

		const { closed } = await connect(`ws://127.0.0.1:${port}/api/v1/ws?token=${TOKEN}`, {
			origin: 'http://evil.example',
		});

		expect(closed).toEqual({ code: 1008, reason: 'origin not allowed' });
		expect(hub.peerCount).toBe(0);
	});

	test('an authorized peer is greeted, acknowledged, and dropped from the hub on close', async () => {
		const hub = new WebSocketHub();
		const { port } = listen(hub);
		let peersWhileOpen = -1;

		const { closed, frames } = await connect(
			`ws://127.0.0.1:${port}/api/v1/ws?token=${TOKEN}`,
			{ origin: ALLOWED_ORIGIN },
			(socket) => {
				socket.addEventListener('message', (event) => {
					const frame = JSON.parse(String(event.data)) as { type: string };
					if (frame.type === 'connected') {
						peersWhileOpen = hub.peerCount;
						socket.send(JSON.stringify({ hello: 'hub' }));
					} else if (frame.type === 'ack') {
						socket.close(1000, 'done');
					}
				});
			},
		);

		expect(frames[0]).toEqual({ payload: { connected: true }, type: 'connected' });
		expect(frames[1]).toEqual({ payload: { hello: 'hub' }, type: 'ack' });
		expect(peersWhileOpen).toBe(1);
		expect(closed.code).toBe(1000);
		expect(await settledPeerCount(hub)).toBe(0);
	});

	test('a hub at peer capacity closes the upgrade 1013', async () => {
		const hub = new WebSocketHub({ maxPeers: 0 });
		const { port } = listen(hub);

		const { closed } = await connect(`ws://127.0.0.1:${port}/api/v1/ws?token=${TOKEN}`, {
			origin: ALLOWED_ORIGIN,
		});

		expect(closed).toEqual({ code: 1013, reason: 'server at peer capacity' });
		expect(hub.peerCount).toBe(0);
	});
});
