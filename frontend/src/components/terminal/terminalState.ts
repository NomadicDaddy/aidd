import type { TerminalServerFrame, TerminalSessionInfo } from 'aidd-shared/contracts/terminal';

import { useSyncExternalStore } from 'react';

import { useTerminalStore } from '../../stores/terminalStore.ts';

export type TerminalStatus = 'connected' | 'connecting' | 'exited';

/** One pane tab: a server PTY session plus this client's connection state to it. */
export interface TerminalTab {
	info: TerminalSessionInfo;
	status: TerminalStatus;
}

export type FrameListener = (frame: TerminalServerFrame) => void;

export const INITIAL_RETRY_DELAY_MS = 1000;
export const MAX_RETRY_DELAY_MS = 30000;
/** Keepalive cadence — keeps idle sockets alive through reverse proxies with idle timeouts. */
export const PING_INTERVAL_MS = 30000;

export interface Connection {
	/** Guards against a stale socket's events queueing work over a newer connection. */
	epoch: number;
	frameListeners: Set<FrameListener>;
	/** Set when the server reports the session no longer exists; close() then drops the tab. */
	gone: boolean;
	pingTimer: null | ReturnType<typeof setInterval>;
	retryDelay: number;
	retryTimer: null | ReturnType<typeof setTimeout>;
	socket: null | WebSocket;
	status: TerminalStatus;
}

// Module-level singletons, mirroring hooks/useWebSocket.ts: the pane stays mounted for the app's
// lifetime once opened, and connection lifecycles must survive re-renders and StrictMode
// double-mounts. The server's session list is the source of truth for which tabs exist; nothing
// about tabs is persisted client-side except the active id and shell preference (terminalStore).
export const connections = new Map<string, Connection>();
export const infos = new Map<string, TerminalSessionInfo>();
let tabOrder: string[] = [];
let unavailable = false;

const listeners = new Set<() => void>();
let tabsSnapshot: TerminalTab[] = [];

export function getTabOrder(): readonly string[] {
	return tabOrder;
}

export function setTabOrder(next: string[]): void {
	tabOrder = next;
	notify();
}

export function isUnavailable(): boolean {
	return unavailable;
}

export function setUnavailable(next: boolean): void {
	if (unavailable === next) return;
	unavailable = next;
	notify();
}

export function notify(): void {
	tabsSnapshot = tabOrder.flatMap((sessionId) => {
		const info = infos.get(sessionId);
		if (!info) return [];
		return [{ info, status: connections.get(sessionId)?.status ?? 'connecting' }];
	});
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** The pane's tabs, in creation order. */
export function useTerminalTabs(): TerminalTab[] {
	return useSyncExternalStore(
		subscribe,
		() => tabsSnapshot,
		() => tabsSnapshot,
	);
}

/** True when the backend has no PTY support (bun-pty failed to load) — retry via retryTerminal(). */
export function useTerminalUnavailable(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => unavailable,
		() => unavailable,
	);
}

export function stopPing(connection: Connection): void {
	if (connection.pingTimer !== null) clearInterval(connection.pingTimer);
	connection.pingTimer = null;
}

export function setStatus(connection: Connection, status: TerminalStatus): void {
	if (connection.status === status) return;
	connection.status = status;
	notify();
}

/** Registers a tab for a session; the caller is responsible for dialing its socket. */
export function addTab(info: TerminalSessionInfo): void {
	infos.set(info.sessionId, info);
	connections.set(info.sessionId, {
		epoch: 0,
		frameListeners: new Set(),
		gone: false,
		pingTimer: null,
		retryDelay: INITIAL_RETRY_DELAY_MS,
		retryTimer: null,
		socket: null,
		// An adopted session may already be dead; the exit frame was broadcast long ago, so the
		// status must come from the snapshot. 'exited' is terminal — connect() never upgrades it.
		status: info.status === 'exited' ? 'exited' : 'connecting',
	});
	tabOrder = [...tabOrder, info.sessionId];
	notify();
}

/** Tears down local state for a tab; does not touch the server session. */
export function removeTabLocal(sessionId: string): void {
	const connection = connections.get(sessionId);
	if (connection) {
		connection.epoch += 1;
		if (connection.retryTimer !== null) clearTimeout(connection.retryTimer);
		connection.retryTimer = null;
		stopPing(connection);
		connection.socket?.close();
		connection.socket = null;
	}
	connections.delete(sessionId);
	infos.delete(sessionId);
	const index = tabOrder.indexOf(sessionId);
	tabOrder = tabOrder.filter((id) => id !== sessionId);
	const store = useTerminalStore.getState();
	if (store.activeSessionId === sessionId) {
		store.setActiveSessionId(tabOrder[Math.min(index, tabOrder.length - 1)] ?? null);
	}
	notify();
}

/** Subscribes to a tab's server frames; returns the unsubscribe. */
export function subscribeTerminalFrames(sessionId: string, listener: FrameListener): () => void {
	const connection = connections.get(sessionId);
	connection?.frameListeners.add(listener);
	return () => {
		connections.get(sessionId)?.frameListeners.delete(listener);
	};
}

function socketFor(sessionId: string): null | WebSocket {
	const socket = connections.get(sessionId)?.socket ?? null;
	return socket?.readyState === WebSocket.OPEN ? socket : null;
}

export function sendTerminalInput(sessionId: string, data: string): void {
	socketFor(sessionId)?.send(JSON.stringify({ data, type: 'input' }));
}

export function sendTerminalResize(sessionId: string, cols: number, rows: number): void {
	socketFor(sessionId)?.send(JSON.stringify({ cols, rows, type: 'resize' }));
}

/** Flow-control ack: tells the server this many chars have been parsed by xterm. */
export function sendTerminalAck(sessionId: string, chars: number): void {
	socketFor(sessionId)?.send(JSON.stringify({ chars, type: 'ack' }));
}
