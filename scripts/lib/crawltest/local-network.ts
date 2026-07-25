import { isLoopbackHostname, isWildcardHostname } from 'aidd-shared';
import { networkInterfaces } from 'node:os';

import type { CrawlArgs } from '../../crawltest-types.ts';

export interface SettingsConfigResponse {
	config: {
		allowRemote: boolean;
		hostname: string;
		port: number;
	};
}

export interface LocalNetworkInterfaceAddress {
	address: string;
	family: 'IPv4' | 'IPv6';
	internal: boolean;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface LocalNetworkProbeDependencies {
	fetch: FetchLike;
	interfaceAddresses: () => LocalNetworkInterfaceAddress[];
}

const INVALID_ORIGIN = 'http://crawltest.invalid';

async function fetchJsonWith<T>(
	fetcher: FetchLike,
	baseUrl: string,
	path: string,
	init?: RequestInit,
): Promise<T> {
	const response = await fetcher(new URL(path, baseUrl), init);
	if (!response.ok) {
		throw new Error(`${path} returned ${response.status}`);
	}
	return (await response.json()) as T;
}

function systemInterfaceAddresses(): LocalNetworkInterfaceAddress[] {
	const addresses: LocalNetworkInterfaceAddress[] = [];
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

function formatHostForUrl(hostname: string): string {
	const trimmed = hostname.trim();
	if (trimmed.includes(':') && !trimmed.startsWith('[')) {
		return `[${trimmed}]`;
	}
	return trimmed;
}

function localNetworkBaseUrl(hostname: string, port: number): string {
	return `http://${formatHostForUrl(hostname)}:${port}`;
}

function normalizeRequestedHost(value: string): string {
	const trimmed = value.trim();
	if (/^https?:\/\//i.test(trimmed)) {
		return new URL(trimmed).hostname;
	}
	return trimmed;
}

export function selectLocalNetworkHost(
	configuredHostname: string,
	requestedHost: null | string,
	interfaceAddresses: LocalNetworkInterfaceAddress[],
): null | string {
	if (requestedHost?.trim()) return normalizeRequestedHost(requestedHost);
	if (!isWildcardHostname(configuredHostname)) return configuredHostname.trim();
	const external = interfaceAddresses.filter((entry) => !entry.internal);
	return (
		external.find((entry) => entry.family === 'IPv4')?.address ??
		external.find((entry) => entry.family === 'IPv6')?.address ??
		null
	);
}

async function fetchStatus(
	fetcher: FetchLike,
	baseUrl: string,
	path: string,
	init?: RequestInit,
): Promise<null | number> {
	try {
		const response = await fetcher(new URL(path, baseUrl), init);
		return response.status;
	} catch {
		return null;
	}
}

export async function assertLocalNetworkAccess(
	args: Pick<CrawlArgs, 'baseUrl' | 'localNetworkHost'>,
	dependencies: LocalNetworkProbeDependencies = {
		fetch,
		interfaceAddresses: systemInterfaceAddresses,
	},
): Promise<string[]> {
	const errors: string[] = [];
	let settings: SettingsConfigResponse;
	try {
		settings = await fetchJsonWith<SettingsConfigResponse>(
			dependencies.fetch,
			args.baseUrl,
			'/api/v1/settings/config',
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return [`[local-network] could not read active settings from ${args.baseUrl}: ${message}`];
	}

	const { allowRemote, hostname, port } = settings.config;
	if (!allowRemote) {
		errors.push('[local-network] web.allowRemote is false; enable local network access first');
	}
	if (isLoopbackHostname(hostname)) {
		errors.push(
			`[local-network] web.hostname "${hostname}" is loopback-only; bind to 0.0.0.0, ::, or a LAN address`,
		);
	}
	if (errors.length > 0) return errors;

	const lanHost = selectLocalNetworkHost(
		hostname,
		args.localNetworkHost,
		dependencies.interfaceAddresses(),
	);
	if (!lanHost) {
		return [
			'[local-network] no non-internal local network interface was found; pass --local-network-host',
		];
	}
	if (isLoopbackHostname(lanHost)) {
		return [
			`[local-network] selected host "${lanHost}" is loopback-only; pass a LAN address with --local-network-host`,
		];
	}

	let lanBaseUrl: string;
	let allowedOrigin: string;
	try {
		lanBaseUrl = localNetworkBaseUrl(lanHost, port);
		allowedOrigin = new URL(lanBaseUrl).origin;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return [`[local-network] could not build LAN URL for "${lanHost}": ${message}`];
	}
	const checks: { label: string; path: string; status: null | number }[] = [
		{
			label: 'health',
			path: '/api/v1/health',
			status: await fetchStatus(dependencies.fetch, lanBaseUrl, '/api/v1/health'),
		},
		{
			label: 'settings',
			path: '/api/v1/settings/config',
			status: await fetchStatus(dependencies.fetch, lanBaseUrl, '/api/v1/settings/config'),
		},
		{
			label: 'allowed origin',
			path: '/api/v1/settings/config',
			status: await fetchStatus(dependencies.fetch, lanBaseUrl, '/api/v1/settings/config', {
				headers: { Origin: allowedOrigin },
			}),
		},
	];
	for (const check of checks) {
		if (check.status === null || check.status < 200 || check.status >= 300) {
			errors.push(
				`[local-network] ${check.label} probe failed at ${lanBaseUrl}${check.path}` +
					` (status=${check.status ?? 'unreachable'})`,
			);
		}
	}

	const invalidOriginStatus = await fetchStatus(
		dependencies.fetch,
		lanBaseUrl,
		'/api/v1/settings/config',
		{ headers: { Origin: INVALID_ORIGIN } },
	);
	if (invalidOriginStatus !== 403) {
		errors.push(
			`[local-network] invalid Origin was not rejected at ${lanBaseUrl}/api/v1/settings/config` +
				` (expected 403, got ${invalidOriginStatus ?? 'unreachable'})`,
		);
	}

	return errors;
}
