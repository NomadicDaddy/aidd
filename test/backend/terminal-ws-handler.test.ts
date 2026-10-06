import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { Elysia } from 'elysia';

import type { WebContext } from '../../backend/src/context.ts';
import type { PtySpawn, PtySpawnOptions } from '../../backend/src/services/terminal/ptyProvider.ts';

import { createTerminalRoutes } from '../../backend/src/routes/terminal.ts';
import { TerminalSessionManager } from '../../backend/src/services/terminal/sessionManager.ts';

const TOKEN = 'terminal-ws-token';
const ALLOWED_ORIGIN = 'http://allowed.example';
const SHELLS = [
	{ args: ['-NoLogo'], id: 'pwsh', label: 'PowerShell 7', path: 'C:\\fake\\pwsh.exe' },
];

// audit-testing-1790882994: the terminal socket's open, message and close handlers carry the
// token and origin gate, the session lookup and the PTY plumbing, and none of them ran under
// test. These drive a real client against a listening server with the fake PTY from the route
// tests, so the frames and close codes are the ones the pane would see.
function fakeSpawn(): PtySpawn {
	let nextPid = 5000;
	return (_file: string, _args: string[], _options: PtySpawnOptions) => ({
		kill: () => {},
		onData: () => ({ dispose: () => {} }),
		onExit: () => ({ dispose: () => {} }),
		pid: nextPid++,
		resize: () => {},
		write: () => {},
	});
}

let stopServer: (() => void) | null = null;

function listen(): { manager: TerminalSessionManager; port: number } {
	const manager = new TerminalSessionManager({
		killTree: () => Promise.resolve(),
		listShells: () => SHELLS,
		rootDir: import.meta.dir,
		spawnPty: fakeSpawn(),
	});
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
		terminalSessionManager: manager,
	} as unknown as WebContext;
	const app = new Elysia()
		.use(createTerminalRoutes(context))
		.listen({ hostname: '127.0.0.1', port: 0 });
	stopServer = () => {
		app.stop(true);
	};
	const port = app.server?.port;
	if (port === undefined) throw new Error('listen did not bind a port');
	return { manager, port };
}

const BunWebSocket = WebSocket as unknown as new (
	url: string,
	options: { headers: Record<string, string> },
) => WebSocket;

interface Closed {
	code: number;
	reason: string;
}

function connect(
	url: string,
	headers: Record<string, string>,
	onFrame?: (frame: Record<string, unknown>, socket: WebSocket) => void,
): Promise<{ closed: Closed; frames: Record<string, unknown>[] }> {
	return new Promise((resolve, reject) => {
		const frames: Record<string, unknown>[] = [];
		const socket = new BunWebSocket(url, { headers });
		socket.addEventListener('message', (event) => {
			const frame = JSON.parse(String(event.data)) as Record<string, unknown>;
			frames.push(frame);
			onFrame?.(frame, socket);
		});
		socket.addEventListener('close', (event) => {
			resolve({ closed: { code: event.code, reason: event.reason }, frames });
		});
		socket.addEventListener('error', () => reject(new Error('socket errored')));
	});
}

async function settle(until: () => boolean): Promise<void> {
	for (let i = 0; i < 50 && !until(); i++) await Bun.sleep(10);
}

afterEach(() => {
	stopServer?.();
	stopServer = null;
});

describe('terminal WebSocket handlers', () => {
	test('a forwarded upgrade with no token is closed 1008 before any session is touched', async () => {
		const { manager, port } = listen();
		const attach = spyOn(manager, 'attach');

		const { closed } = await connect(`ws://127.0.0.1:${port}/api/v1/terminal/ws`, {
			'x-forwarded-for': '100.64.1.2',
		});

		expect(closed).toEqual({ code: 1008, reason: 'not allowed' });
		expect(attach).not.toHaveBeenCalled();
	});

	test('an unknown session gets a session-not-found error frame and is closed 1008', async () => {
		const { port } = listen();

		const { closed, frames } = await connect(
			`ws://127.0.0.1:${port}/api/v1/terminal/ws?token=${TOKEN}&session=no-such-session`,
			{ origin: ALLOWED_ORIGIN },
		);

		expect(frames).toEqual([
			{
				code: 'session-not-found',
				message: 'terminal session not found; create one via POST /terminal/sessions',
				type: 'error',
			},
		]);
		expect(closed).toEqual({ code: 1008, reason: 'session not found' });
	});

	test('a valid session is greeted with hello, its frames reach the PTY, and close only detaches', async () => {
		const { manager, port } = listen();
		const { sessionId } = manager.create();
		const write = spyOn(manager, 'write');
		const resize = spyOn(manager, 'resize');
		const ack = spyOn(manager, 'ack');
		const detach = spyOn(manager, 'detach');
		const kill = spyOn(manager, 'kill');

		const { closed, frames } = await connect(
			`ws://127.0.0.1:${port}/api/v1/terminal/ws?token=${TOKEN}&session=${sessionId}`,
			{ origin: ALLOWED_ORIGIN },
			(frame, socket) => {
				// The pong answers the last frame sent, so everything before it has been routed.
				if (frame.type === 'pong') socket.close(1000, 'done');
				if (frame.type !== 'hello') return;
				socket.send(JSON.stringify({ data: 'ls\r', type: 'input' }));
				socket.send(JSON.stringify({ cols: 120, rows: 40, type: 'resize' }));
				socket.send(JSON.stringify({ chars: 0, type: 'ack' }));
				socket.send(JSON.stringify({ type: 'ping' }));
			},
		);

		expect(frames[0]).toMatchObject({ sessionId, type: 'hello' });
		expect(closed.code).toBe(1000);
		expect(frames.some((frame) => frame.type === 'pong')).toBe(true);
		await settle(() => detach.mock.calls.length > 0);
		expect(write).toHaveBeenCalledWith(sessionId, 'ls\r');
		expect(resize).toHaveBeenCalledWith(sessionId, 120, 40);
		expect(ack).toHaveBeenCalledWith(sessionId, expect.anything(), 0);
		expect(detach).toHaveBeenCalledWith(sessionId, expect.anything());
		expect(kill).not.toHaveBeenCalled();
		expect(manager.listSessions().map((session) => session.sessionId)).toEqual([sessionId]);
	});
});
