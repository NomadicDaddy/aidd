import { describe, expect, test } from 'bun:test';
import type { Page } from 'puppeteer';

import { FRONTEND_ROUTE_IDS, FRONTEND_ROUTE_PATHS } from 'aidd-shared/contracts/frontend-routes';

import { parseCrawlArgs } from '../../scripts/crawltest-config.ts';
import { CRAWL_ROUTE_COVERAGE, DEFAULT_ROUTES } from '../../scripts/crawltest-types.ts';
import {
	assert404,
	classifyPageContent,
	NOT_FOUND_PAGE_SELECTOR,
} from '../../scripts/lib/crawltest/page-assertions/core.ts';
import { initialRoutes } from '../../scripts/lib/crawltest/projects.ts';

function crawlArgs() {
	return {
		...parseCrawlArgs([]),
		baseUrl: 'http://crawltest.local',
		baseUrlProvided: true,
	};
}

const routeFetcher = async (input: RequestInfo | URL): Promise<Response> => {
	const path = new URL(input instanceof Request ? input.url : input).pathname;
	if (path === '/api/v1/projects') {
		return Response.json({ projects: [{ id: 'project/id', name: 'aidd' }] });
	}
	if (path === '/api/v1/recipes') {
		return Response.json({ recipes: [{ id: 'recipe id' }] });
	}
	if (path === '/api/v1/pipeline-sessions') {
		return Response.json({ sessions: [{ id: 'session/id' }] });
	}
	return new Response('Not found', { status: 404 });
};

const expectedDynamicMisses = [
	'[crawltest] no representative pipeline-session; detail route not crawled',
	'[crawltest] no representative project; detail route not crawled',
	'[crawltest] no representative recipe; detail route not crawled',
];

async function expectDynamicRouteMisses(fetcher: typeof routeFetcher): Promise<void> {
	const messages: string[] = [];
	const routes = await initialRoutes(crawlArgs(), fetcher, (message) => messages.push(message));

	expect(routes).toEqual(DEFAULT_ROUTES);
	expect(messages).toEqual(expectedDynamicMisses);
}

describe('crawltest route parity', () => {
	test('classifies every frontend route for crawl coverage', () => {
		expect(Object.keys(CRAWL_ROUTE_COVERAGE).sort()).toEqual([...FRONTEND_ROUTE_IDS].sort());
		expect(new Set(FRONTEND_ROUTE_IDS).size).toBe(FRONTEND_ROUTE_IDS.length);
		expect(FRONTEND_ROUTE_IDS.at(-1)).toBe('notFound');
		expect(CRAWL_ROUTE_COVERAGE.notFound).toEqual({
			kind: 'not-found',
			requiresFlag: '--404',
		});
		expect(parseCrawlArgs(['--404']).check404).toBe(true);
	});

	test('seeds every static route, including create and matrix pages', () => {
		for (const route of [
			FRONTEND_ROUTE_PATHS.about,
			FRONTEND_ROUTE_PATHS.diary,
			FRONTEND_ROUTE_PATHS.projectProfileMatrix,
			FRONTEND_ROUTE_PATHS.recipeCreate,
			FRONTEND_ROUTE_PATHS.settingsExecutionIdentityBadges,
		]) {
			expect(DEFAULT_ROUTES).toContain(route);
		}
		expect(DEFAULT_ROUTES).toContain('/docs/getting-started');
		expect(new Set(DEFAULT_ROUTES).size).toBe(DEFAULT_ROUTES.length);
	});

	test('materializes each data-backed detail route when representative records exist', async () => {
		const routes = await initialRoutes(crawlArgs(), routeFetcher);

		expect(routes).toContain('/projects/project%2Fid');
		expect(routes).toContain('/recipes/recipe%20id');
		expect(routes).toContain('/pipeline-sessions/session%2Fid');
	});

	test('targeted crawls do not require route-discovery APIs', async () => {
		const failFetcher = async (): Promise<Response> => {
			throw new Error('route discovery should not run');
		};
		const routes = await initialRoutes(
			{ ...crawlArgs(), page: FRONTEND_ROUTE_PATHS.director },
			failFetcher
		);

		expect(routes).toEqual([FRONTEND_ROUTE_PATHS.director]);
	});

	test('reports empty dynamic catalogs without failing static coverage', async () => {
		await expectDynamicRouteMisses(async (input) => {
			const path = new URL(input instanceof Request ? input.url : input).pathname;
			if (path === '/api/v1/projects') return Response.json({ projects: [] });
			if (path === '/api/v1/recipes') return Response.json({ recipes: [] });
			if (path === '/api/v1/pipeline-sessions') return Response.json({ sessions: [] });
			return new Response('Not found', { status: 404 });
		});
	});

	test('reports unavailable dynamic route-discovery APIs', async () => {
		await expectDynamicRouteMisses(async () => {
			throw new Error('API unavailable');
		});
	});
});

describe('crawltest page classification', () => {
	test('does not treat ordinary page data containing 404 as a not-found page', () => {
		expect(classifyPageContent('Director retry after HTTP 404', false)).toEqual({
			is404Page: false,
			isErrorPage: false,
		});
	});

	test('uses the dedicated page marker for not-found detection', () => {
		expect(classifyPageContent('No matching route', true).is404Page).toBe(true);
	});

	test('retains explicit runtime-error detection', () => {
		expect(classifyPageContent('Something went wrong while rendering', false).isErrorPage).toBe(
			true
		);
	});

	test('asserts the not-found marker when --404 coverage runs', async () => {
		const visited: string[] = [];
		const queried: string[] = [];
		const page = {
			// Asserting the selector reaches page.$ verbatim is the point: it proves the marker
			// crosses as an argument rather than being spliced into an evaluated source string.
			$: async (selector: string) => {
				queried.push(selector);
				return {};
			},
			goto: async (url: string) => {
				visited.push(url);
			},
		} as unknown as Page;

		expect(await assert404(page, crawlArgs().baseUrl)).toEqual([]);
		expect(queried).toEqual([NOT_FOUND_PAGE_SELECTOR]);
		expect(new URL(visited[0]!).pathname).toStartWith('/crawltest-missing-');
	});

	test('reports a failure when the not-found marker is absent', async () => {
		const page = {
			$: async () => null,
			goto: async () => undefined,
		} as unknown as Page;

		expect(await assert404(page, crawlArgs().baseUrl)).toEqual([
			expect.stringContaining('did not render the not-found page'),
		]);
	});
});
