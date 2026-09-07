import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_PAGE_LIMIT } from '../../backend/src/services/pagination.ts';
import {
	createInitialEndpointBuilders,
	measureInitialEndpointBytes,
} from '../_helpers/dashboard-initial-endpoints.ts';
import { repoRoot, stripComments } from '../_helpers/source-scan.ts';

/**
 * The Dashboard's initial request set, derived from source rather than declared: every data hook
 * the page and its cards call, resolved through the hook's `queryFn` to the endpoint its API
 * function targets. A regression that puts the full project listing back on the landing path — by
 * reintroducing `useProjects()`, or by pointing the summary hook at `/api/v1/projects` — changes
 * this set, which is the thing the PERFORMANCE audit needed a test to notice.
 */
const EXPECTED_INITIAL_ENDPOINTS = [
	'/api/v1/director/chat/sessions',
	'/api/v1/director/cycles',
	'/api/v1/director/fleet',
	'/api/v1/director/profile',
	'/api/v1/director/suggestions',
	'/api/v1/projects/dashboard-summary',
	'/api/v1/runs',
];

/** Endpoints whose weight is the finding: the full listing and the port probe it folded in. */
const BANNED_INITIAL_ENDPOINTS = ['/api/v1/projects', '/api/v1/projects/port-status'];

/** The audit's own cap on everything the landing page pulls before fonts and assets. */
const INITIAL_PAYLOAD_BUDGET_BYTES = 1_048_576;

const frontendSrc = join(repoRoot, 'frontend', 'src');

/** Split a module into its top-level `export function` bodies, keyed by name. */
function exportedFunctions(text: string): Map<string, string> {
	const blocks = new Map<string, string>();
	for (const part of stripComments(text).split(/\nexport /)) {
		const named = /^(?:async )?function (\w+)/.exec(part);
		if (named?.[1]) blocks.set(named[1], part);
	}
	return blocks;
}

function readDirectory(relative: string): Map<string, string> {
	const directory = join(frontendSrc, relative);
	const blocks = new Map<string, string>();
	for (const entry of readdirSync(directory)) {
		if (!/\.tsx?$/.test(entry)) continue;
		for (const [name, body] of exportedFunctions(
			readFileSync(join(directory, entry), 'utf8'),
		)) {
			blocks.set(name, body);
		}
	}
	return blocks;
}

/** API function name to the `/api/v1/...` paths it requests. */
function apiEndpointIndex(): Map<string, string[]> {
	const index = new Map<string, string[]>();
	for (const [name, body] of readDirectory('api')) {
		// Template paths interpolate an id after the static prefix, so stop at the `${`.
		const paths = [...body.matchAll(/['`](\/api\/v1\/[^'`$]*)/g)].map(
			(match) => match[1] ?? '',
		);
		if (paths.length > 0) index.set(name, paths);
	}
	return index;
}

/** Every `useSomething(` called anywhere in the Dashboard page and its cards. */
function dashboardHookCalls(): Set<string> {
	const directory = join(frontendSrc, 'pages', 'dashboard');
	const names = new Set<string>();
	for (const entry of readdirSync(directory)) {
		if (!/\.tsx?$/.test(entry)) continue;
		const source = stripComments(readFileSync(join(directory, entry), 'utf8'));
		for (const match of source.matchAll(/\b(use[A-Z]\w*)\s*\(/g)) names.add(match[1] ?? '');
	}
	return names;
}

/** Index just past a `<…>` type-argument list starting at `from`, or `from` if there is none. */
function skipTypeArguments(body: string, from: number): number {
	let index = from;
	while (/\s/.test(body[index] ?? '')) index += 1;
	if (body[index] !== '<') return from;
	let depth = 0;
	for (; index < body.length; index += 1) {
		if (body[index] === '<') depth += 1;
		else if (body[index] === '>') {
			depth -= 1;
			if (depth === 0) return index + 1;
		}
	}
	return from;
}

/** The source of each `useQuery`/`useInfiniteQuery` call in `body`, brace-balanced. */
function queryBlocks(body: string): string[] {
	const blocks: string[] = [];
	for (const start of body.matchAll(/\buse(?:Infinite)?Query\b/g)) {
		let depth = 0;
		// `useInfiniteQuery<RunsPage, …>({…})` — step over an explicit type-argument list first,
		// or the scan below latches onto a paren inside it and returns a type instead of a call.
		let index = skipTypeArguments(body, (start.index ?? 0) + start[0].length);
		index = body.indexOf('(', index);
		if (index < 0) continue;
		for (; index < body.length; index += 1) {
			const character = body[index];
			if (character === '(' || character === '{') depth += 1;
			else if (character === ')' || character === '}') {
				depth -= 1;
				if (depth === 0) break;
			}
		}
		blocks.push(body.slice(start.index ?? 0, index + 1));
	}
	return blocks;
}

/**
 * Walk the called hooks — following hooks that compose other hooks — and collect the endpoint of
 * every ungated query. Mutations are excluded by construction (only `useQuery` blocks are read),
 * and so is any query carrying an `enabled:` gate: a query that waits on a selection is not part
 * of the initial load.
 */
function resolveInitialEndpoints(): Set<string> {
	const api = apiEndpointIndex();
	const hooks = readDirectory('hooks');
	const endpoints = new Set<string>();
	const pending = [...dashboardHookCalls()];
	const visited = new Set<string>();

	while (pending.length > 0) {
		const name = pending.pop();
		if (name === undefined || visited.has(name)) continue;
		visited.add(name);
		const body = hooks.get(name);
		if (body === undefined) continue;
		for (const block of queryBlocks(body)) {
			if (block.includes('enabled:')) continue;
			for (const token of block.matchAll(/\b(\w+)\b/g)) {
				for (const path of api.get(token[1] ?? '') ?? []) endpoints.add(path);
			}
		}
		for (const call of body.matchAll(/\b(use[A-Z]\w*)\s*\(/g)) {
			if (hooks.has(call[1] ?? '')) pending.push(call[1] ?? '');
		}
	}
	return endpoints;
}

const initialEndpoints = resolveInitialEndpoints();

/**
 * Every initial endpoint's real response body, serialized. Each one is built by the same service
 * or projection its route calls, against the fleet fixture and Director tables seeded to the
 * volumes each endpoint's own LIMIT (or the page size its hook requests) allows — so growth in any
 * of them, not just the dashboard summary, moves the total the budget below is checked against.
 */
const endpointBytes = await measureInitialEndpointBytes();
const totalBytes = [...endpointBytes.values()].reduce((sum, bytes) => sum + bytes, 0);

/** Named sizes, so a budget failure says which endpoint grew rather than only that one did. */
function sizeReport(): string {
	const lines = [...endpointBytes]
		.sort((left, right) => right[1] - left[1])
		.map(([endpoint, bytes]) => `  ${endpoint} = ${bytes.toLocaleString('en-US')} bytes`);
	return [
		`initial API payload = ${totalBytes.toLocaleString('en-US')} bytes of ${INITIAL_PAYLOAD_BUDGET_BYTES.toLocaleString('en-US')}`,
		...lines,
	].join('\n');
}

describe('dashboard initial requests', () => {
	test('the derivation finds the hooks it is meant to police', () => {
		// A resolver that quietly stops reaching hooks turns every assertion below into a pass.
		expect(dashboardHookCalls()).toContain('useDashboardProjectSummary');
		expect(initialEndpoints.size).toBeGreaterThan(0);
	});

	test('the landing page asks for exactly the bounded set', () => {
		expect([...initialEndpoints].sort()).toEqual(EXPECTED_INITIAL_ENDPOINTS);
	});

	test('the full projects listing is not on the initial path', () => {
		for (const banned of BANNED_INITIAL_ENDPOINTS) {
			expect(initialEndpoints.has(banned)).toBe(false);
		}
		// The endpoint still exists for the Projects route; it is only off the landing path.
		expect(apiEndpointIndex().get('listProjects')).toEqual(['/api/v1/projects']);
	});
});

describe('dashboard initial payload', () => {
	test('every initial endpoint is measured, and nothing else is', async () => {
		// The budget totals what the builders produce, so an endpoint the Dashboard requests but
		// no builder covers is an endpoint whose growth the budget cannot see — and a builder for
		// an endpoint the page no longer requests inflates the total with bytes nobody transfers.
		const measured = [...(await createInitialEndpointBuilders()).keys()].sort();

		expect(measured).toEqual(EXPECTED_INITIAL_ENDPOINTS);
		expect(measured).toEqual([...initialEndpoints].sort());
	});

	test('every endpoint body is a real body', () => {
		// A builder whose seeded rows stopped reaching the response would pass the budget by
		// measuring an empty wrapper. 100 bytes is well under the smallest real body — the profile
		// endpoint's single settings row — and well over `{"cycles":[]}`.
		const empty = [...endpointBytes].filter(([, bytes]) => bytes < 100).map(([path]) => path);

		expect(empty).toEqual([]);
	});

	test('the runs page is measured at the size the hook asks for', async () => {
		// `useRuns()` sends no `limit`, so the route clamps to DEFAULT_PAGE_LIMIT. The page also
		// carries the Director cycle rows the feed merges in past that limit, and a next-page
		// cursor — the full first response, which is what the Dashboard actually transfers.
		const build = (await createInitialEndpointBuilders()).get('/api/v1/runs');
		const body = (await build?.()) as { nextCursor: null | string; runs: unknown[] };

		expect(body.runs.length).toBeGreaterThanOrEqual(DEFAULT_PAGE_LIMIT);
		expect(body.nextCursor).not.toBeNull();
	});

	test('the complete initial API payload stays under the budget', () => {
		// Reported as text rather than a bare comparison: on failure the assertion prints the
		// per-endpoint sizes, which names the endpoint that grew.
		const overBudget = totalBytes < INITIAL_PAYLOAD_BUDGET_BYTES ? '' : sizeReport();

		expect(overBudget).toBe('');
		expect(totalBytes).toBeLessThan(INITIAL_PAYLOAD_BUDGET_BYTES);
	});
});
