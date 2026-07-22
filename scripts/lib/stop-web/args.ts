import { parseArgs as parseNodeArgs } from 'node:util';

export interface StopWebOptions {
	force: boolean;
	port: null | number;
}

export function parseStopWebArgs(argv: string[]): StopWebOptions {
	const { values } = parseNodeArgs({
		args: argv,
		options: {
			force: { short: 'f', type: 'boolean' },
			port: { short: 'p', type: 'string' },
		},
		strict: true,
	});

	const force = values.force === true;
	if (values.port === undefined) return { force, port: null };
	const port = Number(values.port);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error('--port must be between 1 and 65535');
	}
	return { force, port };
}

export function forceStopAllowed(
	options: Pick<StopWebOptions, 'force'>,
	platform: NodeJS.Platform = process.platform
): boolean {
	return platform !== 'win32' || options.force;
}
