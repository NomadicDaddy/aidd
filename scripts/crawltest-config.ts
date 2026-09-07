import { parseArgs as parseAiddArgs } from 'aidd-shared/args/index';
import { resolveConfig } from 'aidd-shared/config';
import { resolve } from 'node:path';

import {
	type CrawlArgs,
	DEFAULT_BASE_URL,
	VIEWPORT_ARG_VALUES,
	type ViewportArg,
} from './crawltest-types.ts';

function readValue(args: string[], name: string): null | string {
	const index = args.indexOf(name);
	if (index === -1) return null;
	return args[index + 1] ?? null;
}

function stripMsysPath(value: string): string {
	const match = value.match(/^[A-Z]:\/Program Files\/Git\/(.*)/i);
	return match ? `/${match[1]}` : value;
}

export function normalizeRoute(route: string): string {
	const normalized = stripMsysPath(route);
	if (!normalized.startsWith('/')) return `/${normalized}`;
	return normalized;
}

function parseViewportArg(value: null | string): ViewportArg {
	if (value === null) return 'desktop';
	if ((VIEWPORT_ARG_VALUES as readonly string[]).includes(value)) {
		return value as ViewportArg;
	}
	throw new Error(
		`Unknown --viewport "${value}". Valid values: ${VIEWPORT_ARG_VALUES.join(', ')}`,
	);
}

export function parseCrawlArgs(args: string[]): CrawlArgs {
	const baseUrl = readValue(args, '--base-url');
	return {
		baseUrl: baseUrl ?? DEFAULT_BASE_URL,
		baseUrlProvided: baseUrl !== null,
		bug: args.includes('--bug'),
		bugProject: readValue(args, '--bug-project'),
		check404: args.includes('--404'),
		localNetwork: args.includes('--local-network'),
		localNetworkHost: readValue(args, '--local-network-host'),
		page: readValue(args, '--page'),
		screenshotPages: args.includes('--screenshot-pages'),
		startFrom: readValue(args, '--start-from'),
		viewport: parseViewportArg(readValue(args, '--viewport')),
	};
}

function formatHostForUrl(hostname: string): string {
	const trimmed = hostname.trim();
	if (trimmed.includes(':') && !trimmed.startsWith('[')) return `[${trimmed}]`;
	return trimmed;
}

function resolveConnectHostname(hostname: string): string {
	if (hostname === '0.0.0.0') return '127.0.0.1';
	if (hostname === '::' || hostname === ':::') return '[::1]';
	return hostname;
}

export async function resolveDefaultBaseUrl(
	rootDir = resolve(import.meta.dirname, '..'),
): Promise<string> {
	const config = await resolveConfig(parseAiddArgs(['--web']), { baseDir: rootDir });
	if (!config.web) return DEFAULT_BASE_URL;
	const connectHost = resolveConnectHostname(config.web.hostname);
	return `http://${formatHostForUrl(connectHost)}:${config.web.port}`;
}

export async function resolveCrawlArgs(args: CrawlArgs, rootDir?: string): Promise<CrawlArgs> {
	if (args.baseUrlProvided) return args;
	return { ...args, baseUrl: await resolveDefaultBaseUrl(rootDir) };
}
