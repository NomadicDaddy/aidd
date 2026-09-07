import { afterEach, describe, expect, test } from 'bun:test';

import {
	type Connection,
	connections,
	emitTerminalSocketOpen,
	sendTerminalResizeIfChanged,
	subscribeTerminalSocketOpen,
	type TerminalSize,
} from '../../frontend/src/components/terminal/terminalState.ts';

function createSocket(frames: string[]): { open: () => void; socket: WebSocket } {
	let readyState: number = WebSocket.CONNECTING;
	const socket = {
		get readyState() {
			return readyState;
		},
		send(data: string) {
			frames.push(data);
		},
	} as WebSocket;
	return {
		open: () => {
			readyState = WebSocket.OPEN;
		},
		socket,
	};
}

function addConnection(sessionId: string, socket: WebSocket): Connection {
	const connection: Connection = {
		epoch: 1,
		frameListeners: new Set(),
		gone: false,
		pingTimer: null,
		retryDelay: 1000,
		retryTimer: null,
		socket,
		socketOpenListeners: new Set(),
		status: 'connecting',
	};
	connections.set(sessionId, connection);
	return connection;
}

afterEach(() => {
	connections.clear();
});

describe('terminal resize delivery', () => {
	test('records a size only after dispatch and de-duplicates unchanged geometry', () => {
		const frames: string[] = [];
		const transport = createSocket(frames);
		addConnection('session-1', transport.socket);
		const initialSize: TerminalSize = { cols: 164, rows: 38 };

		let lastSentSize = sendTerminalResizeIfChanged('session-1', initialSize, null);
		expect(lastSentSize).toBeNull();
		expect(frames).toEqual([]);

		transport.open();
		lastSentSize = sendTerminalResizeIfChanged('session-1', initialSize, lastSentSize);
		expect(lastSentSize).toEqual(initialSize);
		expect(frames).toEqual([JSON.stringify({ cols: 164, rows: 38, type: 'resize' })]);

		lastSentSize = sendTerminalResizeIfChanged('session-1', initialSize, lastSentSize);
		expect(lastSentSize).toEqual(initialSize);
		expect(frames).toHaveLength(1);

		const changedSize: TerminalSize = { cols: 180, rows: 42 };
		lastSentSize = sendTerminalResizeIfChanged('session-1', changedSize, lastSentSize);
		expect(lastSentSize).toEqual(changedSize);
		expect(frames).toEqual([
			JSON.stringify({ cols: 164, rows: 38, type: 'resize' }),
			JSON.stringify({ cols: 180, rows: 42, type: 'resize' }),
		]);
	});

	test('notifies subscribers when the socket opens and across later reconnects', () => {
		const transport = createSocket([]);
		const connection = addConnection('session-2', transport.socket);
		let opens = 0;
		const unsubscribe = subscribeTerminalSocketOpen('session-2', () => {
			opens += 1;
		});

		transport.open();
		emitTerminalSocketOpen(connection);
		expect(opens).toBe(1);

		let lateOpens = 0;
		const unsubscribeLate = subscribeTerminalSocketOpen('session-2', () => {
			lateOpens += 1;
		});
		expect(lateOpens).toBe(1);

		emitTerminalSocketOpen(connection);
		expect(opens).toBe(2);
		expect(lateOpens).toBe(2);

		unsubscribe();
		unsubscribeLate();
		emitTerminalSocketOpen(connection);
		expect(opens).toBe(2);
		expect(lateOpens).toBe(2);
	});
});
