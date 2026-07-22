import type { TerminalServerFrame, TerminalSessionInfo } from 'aidd-shared/contracts/terminal';

import { toast } from 'sonner';

import { ApiError } from '../../api/client.ts';
import {
	createTerminalSession,
	fetchTerminalSessions,
	killTerminalSession,
} from '../../api/terminal.ts';
import { currentAuthToken } from '../../stores/authTokenStore.ts';
import { useTerminalStore } from '../../stores/terminalStore.ts';
import {
	addTab,
	connections,
	getTabOrder,
	infos,
	INITIAL_RETRY_DELAY_MS,
	isUnavailable,
	MAX_RETRY_DELAY_MS,
	notify,
	PING_INTERVAL_MS,
	removeTabLocal,
	setStatus,
	setTabOrder,
	setUnavailable,
	stopPing,
} from './terminalState.ts';

let initPromise: null | Promise<void> = null;
/** In-flight tab creation; awaited before deciding a default tab is needed (avoids doubles). */
let activeCreate: null | Promise<unknown> = null;

/** The server no longer knows this session (it restarted); drop the tab and backfill if needed. */
function dropGoneTab(sessionId: string): void {
	removeTabLocal(sessionId);
	if (getTabOrder().length === 0 && useTerminalStore.getState().open && !activeCreate) {
		void createTerminalTab();
	}
}

function scheduleReconnect(sessionId: string, epoch: number): void {
	const connection = connections.get(sessionId);
	if (!connection || epoch !== connection.epoch || connection.retryTimer !== null) return;
	const delay = connection.retryDelay;
	connection.retryDelay = Math.min(connection.retryDelay * 2, MAX_RETRY_DELAY_MS);
	connection.retryTimer = setTimeout(() => {
		connection.retryTimer = null;
		connect(sessionId);
	}, delay);
}

function connect(sessionId: string): void {
	const connection = connections.get(sessionId);
	if (!connection) return;
	const epoch = ++connection.epoch;
	if (connection.status !== 'exited') setStatus(connection, 'connecting');
	const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
	const target = new URL(`${protocol}://${window.location.host}/api/v1/terminal/ws`);
	target.searchParams.set('session', sessionId);
	// Same token-in-query trade-off as the broadcast socket — see the note in hooks/useWebSocket.ts.
	const token = currentAuthToken();
	if (token) target.searchParams.set('token', token);
	const ws = new WebSocket(target.toString());
	connection.socket = ws;
	ws.addEventListener('open', () => {
		if (epoch !== connection.epoch) return;
		stopPing(connection);
		connection.pingTimer = setInterval(() => {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
		}, PING_INTERVAL_MS);
	});
	ws.addEventListener('message', (event) => {
		if (epoch !== connection.epoch) return;
		let frame: TerminalServerFrame;
		try {
			frame = JSON.parse(String(event.data)) as TerminalServerFrame;
		} catch {
			return;
		}
		if (frame.type === 'hello') {
			connection.retryDelay = INITIAL_RETRY_DELAY_MS;
			// Reattaching to a dead session replays its scrollback but cannot revive it.
			if (connection.status !== 'exited') setStatus(connection, 'connected');
		} else if (frame.type === 'exit') {
			// The shell ended. Don't auto-reconnect — a reattach would just replay the dead
			// scrollback. The tab offers restart/close.
			setStatus(connection, 'exited');
		} else if (frame.type === 'error' && frame.code === 'session-not-found') {
			connection.gone = true;
		}
		for (const listener of connection.frameListeners) listener(frame);
	});
	ws.addEventListener('error', () => {
		if (epoch === connection.epoch) ws.close();
	});
	ws.addEventListener('close', () => {
		if (epoch !== connection.epoch) return;
		stopPing(connection);
		connection.socket = null;
		if (connection.gone) {
			dropGoneTab(sessionId);
			return;
		}
		if (connection.status !== 'exited') scheduleReconnect(sessionId, epoch);
	});
}

async function initialize(): Promise<void> {
	try {
		const { sessions } = await fetchTerminalSessions();
		const ordered = [...sessions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		for (const info of ordered) {
			addTab(info);
			connect(info.sessionId);
		}
	} catch {
		// Backend hiccup — the create below (or a retry) will surface the real state.
	}
}

/**
 * Brings the pane's tabs up: adopts the server's live sessions on first call, and guarantees at
 * least one tab exists afterwards. Safe to call on every pane open (later calls are cheap).
 */
export async function ensureTerminalReady(): Promise<void> {
	initPromise ??= initialize();
	await initPromise;
	// A creation kicked off elsewhere (openTerminalPaneAt, a concurrent effect) counts — wait for
	// it before concluding the pane needs a default tab.
	if (activeCreate) await activeCreate;
	if (getTabOrder().length === 0 && !isUnavailable()) await createTerminalTab();
}

/**
 * Spawns a new session and adds its tab (made active). Falls back to the server-default shell when
 * a stale persisted preference is rejected; 503 flips the pane into its unavailable state.
 * @param options - Working directory and/or shell for the new session; omitted fields use the
 * persisted shell preference and the server root.
 * @returns The new session's info, or null when creation failed.
 */
export function createTerminalTab(
	options: { cwd?: string; shellId?: string } = {}
): Promise<null | TerminalSessionInfo> {
	const task = performCreate(options);
	const guard = task
		.catch(() => null)
		.finally(() => {
			if (activeCreate === guard) activeCreate = null;
		});
	activeCreate = guard;
	return task;
}

async function performCreate(options: {
	cwd?: string;
	shellId?: string;
}): Promise<null | TerminalSessionInfo> {
	const preferredShell = options.shellId ?? useTerminalStore.getState().shellId ?? undefined;
	try {
		const info = await createTerminalSession({
			...(options.cwd ? { cwd: options.cwd } : {}),
			...(preferredShell ? { shellId: preferredShell } : {}),
		});
		setUnavailable(false);
		addTab(info);
		connect(info.sessionId);
		useTerminalStore.getState().setActiveSessionId(info.sessionId);
		return info;
	} catch (error) {
		if (error instanceof ApiError && error.status === 503) {
			setUnavailable(true);
			return null;
		}
		// A 400 while a shell preference is set usually means the persisted shell no longer
		// exists on this host (uninstalled WSL distro, removed pwsh) — drop it and retry once
		// with the server default.
		if (
			error instanceof ApiError &&
			error.status === 400 &&
			!options.shellId &&
			useTerminalStore.getState().shellId !== null
		) {
			useTerminalStore.getState().setShellId(null);
			return performCreate(options.cwd ? { cwd: options.cwd } : {});
		}
		toast.error(error instanceof Error ? error.message : 'failed to open a terminal');
		return null;
	}
}

/** Closes a tab and kills its server session; closing the last tab hides the pane. */
export async function closeTerminalTab(sessionId: string): Promise<void> {
	removeTabLocal(sessionId);
	try {
		await killTerminalSession(sessionId);
	} catch {
		// Already gone (backend restarted, or the shell exited) — nothing to clean up.
	}
	if (getTabOrder().length === 0) useTerminalStore.getState().setOpen(false);
}

/** Replaces a tab's session with a fresh one in the same shell and directory, same position. */
export async function restartTerminalTab(sessionId: string): Promise<void> {
	const previous = infos.get(sessionId);
	const index = getTabOrder().indexOf(sessionId);
	removeTabLocal(sessionId);
	try {
		await killTerminalSession(sessionId);
	} catch {
		// Already gone — creating below still works.
	}
	const next = await createTerminalTab({
		...(previous?.cwd ? { cwd: previous.cwd } : {}),
		...(previous?.shellId ? { shellId: previous.shellId } : {}),
	});
	if (next && index >= 0 && index < getTabOrder().length - 1) {
		const reordered = getTabOrder().filter((id) => id !== next.sessionId);
		reordered.splice(index, 0, next.sessionId);
		setTabOrder(reordered);
	}
}

/** Retry after 'unavailable' (e.g. the backend came back with PTY support). */
export function retryTerminal(): void {
	setUnavailable(false);
	initPromise = null;
	notify();
	void ensureTerminalReady();
}

/**
 * Opens the pane focused on a terminal at `cwd`: reuses a live tab already rooted there, or
 * spawns a new one. The entry point for "open in terminal" actions elsewhere in the app.
 * @param cwd - Absolute directory to start the shell in (validated server-side).
 */
export async function openTerminalPaneAt(cwd: string): Promise<void> {
	useTerminalStore.getState().setOpen(true);
	// Deliberately not ensureTerminalReady(): that would spawn a root-cwd default tab first when
	// this is the pane's very first open. Adopt live sessions, then reuse-or-create directly.
	initPromise ??= initialize();
	await initPromise;
	if (activeCreate) await activeCreate;
	const existing = getTabOrder()
		.map((sessionId) => infos.get(sessionId))
		.find((info) => info?.cwd === cwd && connections.get(info.sessionId)?.status !== 'exited');
	if (existing) {
		useTerminalStore.getState().setActiveSessionId(existing.sessionId);
		return;
	}
	await createTerminalTab({ cwd });
}
