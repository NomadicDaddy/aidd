import type { ResolvedWebConfig } from 'aidd-shared/config';

import { isLoopbackHostname, isWildcardHostname, normalizedHostname } from 'aidd-shared';
import { networkInterfaces } from 'node:os';

export interface OriginInterfaceAddress {
	address: string;
	family: 'IPv4' | 'IPv6';
	internal: boolean;
}

// An IPv6 literal must be bracketed in an origin (`http://[::1]:3210`); a name or IPv4 is not.
function addOrigin(origins: Set<string>, hostname: string, port: number): void {
	if (!hostname) return;
	if (hostname.includes(':') && !hostname.startsWith('[')) {
		origins.add(`http://[${hostname}]:${port}`);
		return;
	}
	origins.add(`http://${hostname}:${port}`);
}

function addConfiguredOrigin(origins: Set<string>, origin: string): void {
	const trimmed = origin.trim();
	if (!trimmed) return;
	origins.add(new URL(trimmed).origin);
}

function localInterfaceAddresses(): OriginInterfaceAddress[] {
	const addresses: OriginInterfaceAddress[] = [];
	for (const entries of Object.values(networkInterfaces())) {
		for (const entry of entries ?? []) {
			if (entry.family !== 'IPv4' && entry.family !== 'IPv6') continue;
			addresses.push({
				address: entry.address,
				family: entry.family,
				internal: entry.internal,
			});
		}
	}
	return addresses;
}

function addLocalInterfaceOrigins(
	origins: Set<string>,
	port: number,
	interfaceAddresses: OriginInterfaceAddress[],
): void {
	for (const entry of interfaceAddresses) {
		// Internal (loopback) interfaces are covered by the loopback aliases; only the addresses
		// a LAN client could type are added here.
		if (entry.internal) continue;
		addOrigin(origins, entry.address, port);
	}
}

function addLoopbackAliases(origins: Set<string>, hostname: string, port: number): void {
	if (isLoopbackHostname(hostname) || isWildcardHostname(hostname)) {
		addOrigin(origins, 'localhost', port);
		addOrigin(origins, '127.0.0.1', port);
		addOrigin(origins, '::1', port);
	}
}

/**
 * The browser origins allowed to reach `/api/*`, `/ws` and the terminal sockets, and through
 * `buildTrustedRequestHost` the `Host` names granted token-free loopback access. Security logic,
 * so every source is named here:
 *
 * 1. The listener itself: `http://<web.hostname>:<web.port>`.
 * 2. For a loopback or wildcard listener, the loopback aliases `localhost`, `127.0.0.1` and `::1`
 *    on the same port, since a browser may reach the same socket under any of them.
 * 3. For a wildcard listener only (`0.0.0.0`, `::`), every non-internal interface address on the
 *    same port: that listener answers on each of them, so a LAN client's origin is one of them.
 * 4. Every `web.allowedOrigins` entry, normalised to `URL.origin` (scheme, host, port; no path).
 *    A malformed entry throws here, at startup, rather than silently admitting nothing.
 *
 * A loopback listener therefore adds no LAN interface origin on its own; whatever
 * `web.allowedOrigins` names is admitted regardless of the listener, which is how a reverse proxy
 * in front of the panel gets in (see docs/reference/deployment.md).
 * @param webConfig The resolved `web` block.
 * @param interfaceAddresses The host's interfaces; injected by tests, read from the OS otherwise.
 * @returns Allowed origins in `scheme://host:port` form.
 */
export function buildAllowedOrigins(
	webConfig: ResolvedWebConfig,
	interfaceAddresses: OriginInterfaceAddress[] = localInterfaceAddresses(),
): Set<string> {
	const origins = new Set<string>();
	const { hostname, port } = webConfig;
	addOrigin(origins, hostname, port);
	addLoopbackAliases(origins, hostname, port);
	if (isWildcardHostname(hostname)) {
		addLocalInterfaceOrigins(origins, port, interfaceAddresses);
	}
	for (const origin of webConfig.allowedOrigins) {
		addConfiguredOrigin(origins, origin);
	}
	return origins;
}

/**
 * Builds the test for hostnames a request may name in its `Host` header and still use the panel's
 * token-free loopback access: loopback names plus the host of every allowed origin. A DNS-rebinding
 * page reaches the loopback listener from the browser under the attacker's own hostname, so that
 * name must never qualify. The port is ignored: an attacker controls the name, not the port.
 */
export function buildTrustedRequestHost(
	webConfig: ResolvedWebConfig | undefined,
	interfaceAddresses?: OriginInterfaceAddress[],
): (hostname: string) => boolean {
	const trusted = new Set<string>();
	if (webConfig) {
		for (const origin of buildAllowedOrigins(webConfig, interfaceAddresses)) {
			trusted.add(normalizedHostname(new URL(origin).hostname));
		}
	}
	return (hostname) => isLoopbackHostname(hostname) || trusted.has(normalizedHostname(hostname));
}

export function isAllowedOrigin(webConfig: ResolvedWebConfig, origin: string): boolean {
	try {
		return buildAllowedOrigins(webConfig).has(new URL(origin).origin);
	} catch {
		return false;
	}
}
