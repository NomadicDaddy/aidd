import { createConnection } from 'node:net';

export function isPortListening(
	port: number,
	host = '127.0.0.1',
	timeoutMs = 500
): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ host, port });
		socket.setTimeout(timeoutMs);

		socket.on('connect', () => {
			socket.destroy();
			resolve(true);
		});

		socket.on('timeout', () => {
			socket.destroy();
			resolve(false);
		});

		socket.on('error', () => {
			socket.destroy();
			resolve(false);
		});
	});
}
