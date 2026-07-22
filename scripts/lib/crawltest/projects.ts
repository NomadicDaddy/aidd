import type { Page } from 'puppeteer';

import { FRONTEND_ROUTE_PATHS } from 'aidd-shared/contracts/frontend-routes';

import { normalizeRoute } from '../../crawltest-config.ts';
import {
	CRAWL_ROUTE_COVERAGE,
	DEFAULT_ROUTES,
	type CrawlArgs,
	type CrawlRouteCoverage,
} from '../../crawltest-types.ts';

export interface ProjectSummary {
	id: string;
	name: string;
	path?: string;
}

export interface ProjectsResponse {
	projects: ProjectSummary[];
}

interface PipelineSessionsResponse {
	sessions: { id: string }[];
}

interface RecipesResponse {
	recipes: { id: string }[];
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type CrawlRouteLogger = (message: string) => void;
type DynamicCrawlRouteKind = Exclude<CrawlRouteCoverage['kind'], 'not-found' | 'static'>;

export async function fetchJson<T>(
	baseUrl: string,
	path: string,
	init?: RequestInit,
	fetcher: Fetcher = fetch
): Promise<T> {
	const response = await fetcher(new URL(path, baseUrl), init);
	if (!response.ok) {
		throw new Error(`${path} returned ${response.status}`);
	}
	return (await response.json()) as T;
}

export function isAiddBugProject(project: ProjectSummary): boolean {
	const name = project.name.trim().toLowerCase();
	if (name === 'aidd') return true;

	const normalizedPath = project.path?.replace(/\\/g, '/').toLowerCase();
	return normalizedPath?.endsWith('/aidd') === true;
}

export function defaultBugProjectId(projects: ProjectSummary[]): string {
	const project = projects.find(isAiddBugProject);
	if (!project) {
		throw new Error(
			'aidd project is not available for --bug; pass --bug-project to choose one.'
		);
	}
	return project.id;
}

export async function resolveBugProject(
	baseUrl: string,
	requestedProject: null | string
): Promise<string> {
	const projects = await fetchJson<ProjectsResponse>(baseUrl, '/api/v1/projects');
	if (!requestedProject) return defaultBugProjectId(projects.projects);

	const exact = projects.projects.find((project) => project.id === requestedProject);
	if (exact) return exact.id;

	const byName = projects.projects.find((project) => project.name === requestedProject);
	if (byName) return byName.id;

	return requestedProject;
}

function detailRoute(pattern: string, id: string): string {
	return pattern.replace(':id', encodeURIComponent(id));
}

async function representativePipelineSessionRoute(
	baseUrl: string,
	fetcher: Fetcher
): Promise<null | string> {
	try {
		const response = await fetchJson<PipelineSessionsResponse>(
			baseUrl,
			'/api/v1/pipeline-sessions?limit=1',
			undefined,
			fetcher
		);
		const session = response.sessions[0];
		return session ? detailRoute(FRONTEND_ROUTE_PATHS.pipelineSessionDetail, session.id) : null;
	} catch {
		return null;
	}
}

async function representativeProjectRoute(
	baseUrl: string,
	fetcher: Fetcher
): Promise<null | string> {
	try {
		const response = await fetchJson<ProjectsResponse>(
			baseUrl,
			'/api/v1/projects',
			undefined,
			fetcher
		);
		const project = response.projects.find(isAiddBugProject) ?? response.projects[0];
		return project ? detailRoute(FRONTEND_ROUTE_PATHS.projectDetail, project.id) : null;
	} catch {
		return null;
	}
}

async function representativeRecipeRoute(
	baseUrl: string,
	fetcher: Fetcher
): Promise<null | string> {
	try {
		const response = await fetchJson<RecipesResponse>(
			baseUrl,
			'/api/v1/recipes',
			undefined,
			fetcher
		);
		const recipe = response.recipes[0];
		return recipe ? detailRoute(FRONTEND_ROUTE_PATHS.recipeDetail, recipe.id) : null;
	} catch {
		return null;
	}
}

const dynamicRouteResolvers: Record<
	DynamicCrawlRouteKind,
	(baseUrl: string, fetcher: Fetcher) => Promise<null | string>
> = {
	'pipeline-session': representativePipelineSessionRoute,
	project: representativeProjectRoute,
	recipe: representativeRecipeRoute,
};

function dynamicCrawlRouteKinds(): DynamicCrawlRouteKind[] {
	const kinds = new Set<DynamicCrawlRouteKind>();
	for (const coverage of Object.values(CRAWL_ROUTE_COVERAGE)) {
		if (coverage.kind !== 'not-found' && coverage.kind !== 'static') {
			kinds.add(coverage.kind);
		}
	}
	return [...kinds];
}

export async function initialRoutes(
	args: CrawlArgs,
	fetcher: Fetcher = fetch,
	log: CrawlRouteLogger = console.log
): Promise<string[]> {
	if (args.page) return [normalizeRoute(args.page)];
	if (args.startFrom) return [normalizeRoute(args.startFrom)];

	const routes = new Set<string>(DEFAULT_ROUTES);
	const dynamicKinds = dynamicCrawlRouteKinds();
	const dynamicRoutes = await Promise.all(
		dynamicKinds.map(async (kind) => await dynamicRouteResolvers[kind](args.baseUrl, fetcher))
	);
	for (const [index, kind] of dynamicKinds.entries()) {
		const route = dynamicRoutes[index];
		if (route) {
			routes.add(route);
		} else {
			log(`[crawltest] no representative ${kind}; detail route not crawled`);
		}
	}
	return [...routes];
}

export async function fileBugThroughUi(
	page: Page,
	baseUrl: string,
	projectId: string
): Promise<void> {
	await page.goto(new URL(`/projects/${encodeURIComponent(projectId)}`, baseUrl).toString(), {
		waitUntil: 'networkidle2',
	});
	await page.waitForSelector('button[aria-label="Report a bug or request a feature"]', {
		timeout: 10_000,
	});
	await page.click('button[aria-label="Report a bug or request a feature"]');
	await page.waitForSelector('#project-report-description', { timeout: 10_000 });
	await page.type(
		'#project-report-description',
		`crawltest bug submission ${new Date().toISOString()}`
	);
	await page.click('button[type="submit"]');
	await page.waitForFunction("!document.querySelector('#project-report-description')", {
		timeout: 10_000,
	});
}
