import type { TerminalServerFrame, TerminalSessionInfo } from 'aidd-shared/contracts/terminal';

import { useSyncExternalStore } from 'react';

import type { TerminalUnavailableReason } from './terminalUnavailable.ts';

import { useTerminalStore } from '../../stores/terminalStore.ts';

export type TerminalStatus = 'connected' | 'connecting' | 'exited';

/** One pane tab: a server PTY session plus this client's connection state to it. */
export interface TerminalTab {
	info: TerminalSessionInfo;
	status: TerminalStatus;
}

export type FrameListener = (frame: TerminalServerFrame) => void;
export type SocketOpenListener = () => void;

export interface TerminalSize {
	cols: number;
	rows: number;
}

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
	socketOpenListeners: Set<SocketOpenListener>;
	status: TerminalStatus;
}

// Module-level singletons, mirroring hooks/useWebSocket.ts: the pane stays mounted for the app's
// lifetime once opened, and connection lifecycles must survive re-renders and StrictMode
// double-mounts. The server's session list is the source of truth for which tabs exist; nothing
// about tabs is persisted client-side except the active id and shell preference (terminalStore).
export const connections = new Map<string, Connection>();
export const infos = new Map<string, TerminalSessionInfo>();
let tabOrder: string[] = [];
let unavailable: null | TerminalUnavailableReason = null;
// Distinct from "no tabs": the pane opens, asks the server for its sessions, and until that
// answers there is nothing to show and nothing wrong. Rendering the same blank region for both
// is what made an unreachable backend look like an idle pane.
let starting = false;

const listeners = new Set<() => void>();
let tabsSnapshot: TerminalTab[] = [];

export function getTabOrder(): readonly string[] {
	return tabOrder;
}

export function setTabOrder(next: string[]): void {
	tabOrder = next;
	notify();
}

/**
 * Whether this host has told us it cannot run a PTY at all. Only this reason suppresses the
 * automatic create in ensureTerminalReady: an unreachable or erroring backend may well be back,
 * and a pane that will not try again on its own is one the operator has to know to retry.
 */
export function isPtyUnsupported(): boolean {
	return unavailable === 'no-pty';
}

export function setUnavailable(next: null | TerminalUnavailableReason): void {
	if (unavailable === next) return;
	unavailable = next;
	notify();
}

export function setStarting(next: boolean): void {
	if (starting === next) return;
	starting = next;
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

/** Why the pane has no terminal, or null when nothing has failed — retry via retryTerminal(). */
export function useTerminalUnavailable(): null | TerminalUnavailableReason {
	return useSyncExternalStore(
		subscribe,
		() => unavailable,
		() => unavailable,
	);
}

/** True while the pane is adopting the server's sessions or spawning its first tab. */
export function useTerminalStarting(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => starting,
		() => starting,
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
		socketOpenListeners: new Set(),
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

/** Subscribes to every successful socket attachment, including reconnects. */
export function subscribeTerminalSocketOpen(
	sessionId: string,
	listener: SocketOpenListener,
): () => void {
	const connection = connections.get(sessionId);
	if (!connection) return () => {};
	connection.socketOpenListeners.add(listener);
	if (connection.socket?.readyState === WebSocket.OPEN) listener();
	return () => {
		connections.get(sessionId)?.socketOpenListeners.delete(listener);
	};
}

export function emitTerminalSocketOpen(connection: Connection): void {
	for (const listener of connection.socketOpenListeners) listener();
}

function socketFor(sessionId: string): null | WebSocket {
	const socket = connections.get(sessionId)?.socket ?? null;
	return socket?.readyState === WebSocket.OPEN ? socket : null;
}

export function sendTerminalInput(sessionId: string, data: string): void {
	socketFor(sessionId)?.send(JSON.stringify({ data, type: 'input' }));
}

export function sendTerminalResize(sessionId: string, cols: number, rows: number): boolean {
	const socket = socketFor(sessionId);
	if (!socket) return false;
	socket.send(JSON.stringify({ cols, rows, type: 'resize' }));
	return true;
}

/** Returns the last size actually dispatched, preserving it when the socket is not open. */
export function sendTerminalResizeIfChanged(
	sessionId: string,
	size: TerminalSize,
	lastSentSize: null | TerminalSize,
): null | TerminalSize {
	if (lastSentSize?.cols === size.cols && lastSentSize.rows === size.rows) return lastSentSize;
	return sendTerminalResize(sessionId, size.cols, size.rows) ? size : lastSentSize;
}

/** Flow-control ack: tells the server this many chars have been parsed by xterm. */
export function sendTerminalAck(sessionId: string, chars: number): void {
	socketFor(sessionId)?.send(JSON.stringify({ chars, type: 'ack' }));
}
