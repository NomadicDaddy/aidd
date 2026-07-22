import { describe, expect, test } from 'bun:test';

import type { WebContext } from '../../backend/src/context.ts';
import type { PtySpawn, PtySpawnOptions } from '../../backend/src/services/terminal/ptyProvider.ts';

import { createTerminalRoutes } from '../../backend/src/routes/terminal.ts';
import { TerminalSessionManager } from '../../backend/src/services/terminal/sessionManager.ts';

const SHELLS = [
	{ args: ['-NoLogo'], id: 'pwsh', label: 'PowerShell 7', path: 'C:\\fake\\pwsh.exe' },
];

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

function createApp(spawnPty: null | PtySpawn) {
	const manager = new TerminalSessionManager({
		killTree: () => Promise.resolve(),
		listShells: () => SHELLS,
		// A real directory — create() stat-validates the working directory before spawning.
		rootDir: import.meta.dir,
		spawnPty,
	});
	const context = {
		config: {
			web: { allowedOrigins: [], authToken: undefined, hostname: '127.0.0.1', port: 3210 },
		},
		terminalSessionManager: manager,
	} as unknown as WebContext;
	return { app: createTerminalRoutes(context), manager };
}

const BASE = 'http://127.0.0.1:3210/api/v1';

describe('terminal routes', () => {
	test('GET /terminal/shells lists detected shells', async () => {
		const { app } = createApp(fakeSpawn());
		const response = await app.handle(new Request(`${BASE}/terminal/shells`));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ shells: SHELLS });
	});

	test('GET /terminal/shells is 503 when the pty provider is unavailable', async () => {
		const { app } = createApp(null);
		const response = await app.handle(new Request(`${BASE}/terminal/shells`));
		expect(response.status).toBe(503);
	});

	test('POST /terminal/sessions creates a fresh session per call', async () => {
		const { app } = createApp(fakeSpawn());
		const create = (body: Record<string, string> = {}) =>
			app.handle(
				new Request(`${BASE}/terminal/sessions`, {
					body: JSON.stringify(body),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				})
			);
		const first = (await (await create()).json()) as {
			cwd: string;
			sessionId: string;
			shellId: string;
		};
		expect(first.shellId).toBe('pwsh');
		expect(first.cwd).toBe(import.meta.dir);
		const second = (await (await create()).json()) as { sessionId: string };
		expect(second.sessionId).not.toBe(first.sessionId);
	});

	test('POST /terminal/sessions rejects a bogus cwd with 400 and enforces the cap with 409', async () => {
		const { app } = createApp(fakeSpawn());
		const create = (body: Record<string, string> = {}) =>
			app.handle(
				new Request(`${BASE}/terminal/sessions`, {
					body: JSON.stringify(body),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				})
			);
		const bogus = await create({ cwd: 'D:\\definitely\\not\\a\\real\\dir' });
		expect(bogus.status).toBe(400);
		for (let i = 0; i < 8; i++) expect((await create()).status).toBe(200);
		expect((await create()).status).toBe(409);
	});

	test('POST /terminal/sessions is 503 when unavailable and 400 for an unknown shell', async () => {
		const unavailable = createApp(null);
		const responseA = await unavailable.app.handle(
			new Request(`${BASE}/terminal/sessions`, {
				body: JSON.stringify({}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(responseA.status).toBe(503);
		const available = createApp(fakeSpawn());
		const responseB = await available.app.handle(
			new Request(`${BASE}/terminal/sessions`, {
				body: JSON.stringify({ shellId: 'not-a-shell' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(responseB.status).toBe(400);
	});

	test('GET /terminal/sessions reflects the registry', async () => {
		const { app, manager } = createApp(fakeSpawn());
		const empty = (await (
			await app.handle(new Request(`${BASE}/terminal/sessions`))
		).json()) as { sessions: unknown[] };
		expect(empty.sessions).toEqual([]);
		const info = manager.create();
		const listed = (await (
			await app.handle(new Request(`${BASE}/terminal/sessions`))
		).json()) as { sessions: { sessionId: string }[] };
		expect(listed.sessions.map((entry) => entry.sessionId)).toEqual([info.sessionId]);
	});

	test('DELETE /terminal/sessions/:id kills a session and 404s an unknown one', async () => {
		const { app, manager } = createApp(fakeSpawn());
		const info = manager.create();
		const ok = await app.handle(
			new Request(`${BASE}/terminal/sessions/${info.sessionId}`, { method: 'DELETE' })
		);
		expect(ok.status).toBe(200);
		expect(manager.listSessions()).toEqual([]);
		const missing = await app.handle(
			new Request(`${BASE}/terminal/sessions/${info.sessionId}`, { method: 'DELETE' })
		);
		expect(missing.status).toBe(404);
	});
});
