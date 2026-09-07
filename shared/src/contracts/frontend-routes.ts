export const FRONTEND_ROUTE_PATHS = {
	about: '/about',
	audits: '/audits',
	dashboard: '/',
	diary: '/diary',
	director: '/director',
	docs: '/docs',
	docsDetail: '/docs/:slug',
	notFound: '*',
	pipelineSessionDetail: '/pipeline-sessions/:id',
	pipelineSessions: '/pipeline-sessions',
	projectDetail: '/projects/:id',
	projectProfileMatrix: '/projects/profile-matrix',
	projects: '/projects',
	recipeCreate: '/recipes/new',
	recipeDetail: '/recipes/:id',
	recipes: '/recipes',
	runs: '/runs',
	scheduled: '/scheduled',
	settings: '/settings',
	settingsExecutionIdentityBadges: '/settings/execution-identity-badges',
	skills: '/skills',
	telemetry: '/telemetry',
} as const;

export type FrontendRouteId = keyof typeof FRONTEND_ROUTE_PATHS;

export const FRONTEND_ROUTE_IDS: FrontendRouteId[] = [
	...(Object.keys(FRONTEND_ROUTE_PATHS).filter((id) => id !== 'notFound') as FrontendRouteId[]),
	'notFound',
];
export const DEFAULT_DOCS_ROUTE = '/docs/getting-started';
export const NOT_FOUND_PAGE_MARKER = 'not-found';
