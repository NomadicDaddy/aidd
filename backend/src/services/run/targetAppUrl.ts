import { isWildcardHostname } from 'aidd-shared';

import { gatherPorts } from '../projectMetadata/versionHelpers.ts';

/**
 * The URL of the aidd web panel for a dogfood run — the panel that launched the run is itself the
 * app under test.
 *
 * `hostname` is the server's *bind* host, which is a wildcard (0.0.0.0 / ::) when the panel listens
 * on all interfaces. A wildcard is a valid listen address but not a valid *connect* address: handing
 * the agent `http://0.0.0.0:3210` makes agent-browser fail with net::ERR_ADDRESS_INVALID, so the
 * UI feature parks for manual verification for no reason. Resolve a wildcard bind to loopback so the
 * address the agent receives is actually reachable.
 *
 * @param hostname The server's configured bind host.
 * @param port The panel's listen port.
 * @returns A connectable `http://host:port` address.
 */
export function resolveDogfoodAppUrl(hostname: string, port: number): string {
	const connectHost = isWildcardHostname(hostname) ? '127.0.0.1' : hostname;
	return `http://${connectHost}:${port}`;
}

/**
 * The URL of the application under test for a non-dogfood run.
 *
 * Without this the prompt tells the agent nothing about where the app lives, and the agent guesses
 * framework defaults — real runs burned their verification budget probing localhost:3000 and :5173
 * while the project's own config declared 3330. gatherPorts already resolves the target project's
 * configured frontend port (config/<slug>.json, config.json, or a broad config/*.json scan), so the
 * detection is reused rather than duplicated; this only turns it into an address.
 *
 * Returns null when no frontend port is declared, in which case the caller sends no launch context
 * at all — an absent hint is recoverable, a wrong one sends the agent to someone else's server.
 *
 * @param projectDir Absolute path to the target project.
 * @returns The app's address, or null when the project declares no usable frontend port.
 */
export async function resolveTargetAppUrl(projectDir: string): Promise<null | string> {
	const ports = await gatherPorts(projectDir).catch(() => null);
	const frontendPort = ports?.frontendPort;
	if (typeof frontendPort !== 'number' || !Number.isInteger(frontendPort)) return null;
	if (frontendPort <= 0 || frontendPort > 65535) return null;
	return `http://localhost:${frontendPort}`;
}
