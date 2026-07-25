import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	DEFAULT_DOCS_ROUTE,
	FRONTEND_ROUTE_IDS,
	FRONTEND_ROUTE_PATHS,
	type FrontendRouteId,
} from 'aidd-shared/contracts/frontend-routes';
import { lazy, type ReactNode, Suspense, useEffect, useRef } from 'react';
import {
	createBrowserRouter,
	Navigate,
	Outlet,
	RouterProvider,
	useLocation,
} from 'react-router-dom';
import { Toaster } from 'sonner';

import { AppLayout } from './components/layout/AppLayout.tsx';
import { ErrorBoundary } from './components/shared/ErrorBoundary.tsx';
import { useLaunchedRunToasts } from './hooks/useLaunchedRunToasts.ts';
import { useRealtimeInvalidation } from './hooks/useRealtimeInvalidation.ts';
import { useTheme } from './hooks/useTheme.ts';
import { NotFoundPage } from './pages/notFound/NotFoundPage.tsx';
import { useThemeStore } from './stores/themeStore.ts';

const AboutPage = lazy(() =>
	import('./pages/about/AboutPage.tsx').then((m) => ({ default: m.AboutPage })),
);
const DirectorPage = lazy(() =>
	import('./pages/director/DirectorPage.tsx').then((m) => ({ default: m.DirectorPage })),
);
const DashboardPage = lazy(() =>
	import('./pages/dashboard/DashboardPage.tsx').then((m) => ({ default: m.DashboardPage })),
);
const DiaryPage = lazy(() =>
	import('./pages/diary/DiaryPage.tsx').then((m) => ({ default: m.DiaryPage })),
);
const DocsPage = lazy(() =>
	import('./pages/docs/DocsPage.tsx').then((m) => ({ default: m.DocsPage })),
);
const AuditsPage = lazy(() =>
	import('./pages/audits/AuditsPage.tsx').then((m) => ({ default: m.AuditsPage })),
);
const SkillsPage = lazy(() =>
	import('./pages/skills/SkillsPage.tsx').then((m) => ({
		default: m.SkillsPage,
	})),
);
const PipelineSessionReportPage = lazy(() =>
	import('./pages/pipelineSessions/PipelineSessionReportPage.tsx').then((m) => ({
		default: m.PipelineSessionReportPage,
	})),
);
const ProjectDetailPage = lazy(() =>
	import('./pages/projects/ProjectDetailPage.tsx').then((m) => ({
		default: m.ProjectDetailPage,
	})),
);
const ProjectProfileMatrixPage = lazy(() =>
	import('./pages/projects/profileMatrix/ProfileMatrixPage.tsx').then((m) => ({
		default: m.ProfileMatrixPage,
	})),
);
const ProjectsPage = lazy(() =>
	import('./pages/projects/ProjectsPage.tsx').then((m) => ({ default: m.ProjectsPage })),
);
const RecipeCreatePage = lazy(() =>
	import('./pages/recipes/RecipeCreatePage.tsx').then((m) => ({ default: m.RecipeCreatePage })),
);
const RecipeDetailPage = lazy(() =>
	import('./pages/recipes/RecipeDetailPage.tsx').then((m) => ({ default: m.RecipeDetailPage })),
);
const RecipesPage = lazy(() =>
	import('./pages/recipes/RecipesPage.tsx').then((m) => ({ default: m.RecipesPage })),
);
const RunsPage = lazy(() =>
	import('./pages/runs/RunsPage.tsx').then((m) => ({ default: m.RunsPage })),
);
const SettingsPage = lazy(() =>
	import('./pages/settings/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })),
);
const ExecutionIdentityBadgeLabPage = lazy(() =>
	import('./pages/settings/ExecutionIdentityBadgeLabPage.tsx').then((m) => ({
		default: m.ExecutionIdentityBadgeLabPage,
	})),
);
const TelemetryPage = lazy(() =>
	import('./pages/telemetry/TelemetryPage.tsx').then((m) => ({ default: m.TelemetryPage })),
);

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// Concurrent component mounts share one fetch instead of each refetching
			// the same key on mount. Freshness is preserved by explicit invalidation
			// (socket events in useRealtimeInvalidation + mutation onSuccess handlers)
			// and per-query refetchInterval polling, both of which override staleTime.
			staleTime: 30_000,
		},
	},
});

function ThemeApplicator({ children }: { children: ReactNode }) {
	useTheme();
	return <>{children}</>;
}

function RealtimeInvalidator() {
	useRealtimeInvalidation();
	useLaunchedRunToasts();
	return null;
}

function ThemedToaster() {
	const mode = useThemeStore((state) => state.mode);
	return <Toaster position="bottom-right" richColors theme={mode} />;
}

function RootLayout() {
	const location = useLocation();
	// On SPA navigation, move focus to the <main id="main-content"> landmark so keyboard and
	// screen-reader users land at the new page's content instead of retaining stale focus on a
	// now-unmounted control (or the body). main persists across route changes (it lives in
	// AppLayout, outside the lazy Suspense boundary), so this fires reliably even while the next
	// page is still loading its chunk. The first mount is skipped so a deep-link landing keeps the
	// browser's natural initial focus rather than being yanked to main.
	const isInitialNavigationRef = useRef(true);
	useEffect(() => {
		if (isInitialNavigationRef.current) {
			isInitialNavigationRef.current = false;
			return;
		}
		document.getElementById('main-content')?.focus();
	}, [location.pathname]);
	return (
		<AppLayout>
			<ErrorBoundary resetKey={location.pathname}>
				<Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
					<Outlet />
				</Suspense>
			</ErrorBoundary>
		</AppLayout>
	);
}

const routeElements: Record<FrontendRouteId, ReactNode> = {
	about: <AboutPage />,
	audits: <AuditsPage />,
	dashboard: <DashboardPage />,
	diary: <DiaryPage />,
	director: <DirectorPage />,
	docs: <Navigate replace to={DEFAULT_DOCS_ROUTE} />,
	docsDetail: <DocsPage />,
	notFound: <NotFoundPage />,
	pipelineSessionDetail: <PipelineSessionReportPage />,
	// Executions are consolidated on the Runs page; the old list path redirects so
	// bookmarks and external links keep resolving. The per-session report survives.
	pipelineSessions: <Navigate replace to="/runs" />,
	projectDetail: <ProjectDetailPage />,
	projectProfileMatrix: <ProjectProfileMatrixPage />,
	projects: <ProjectsPage />,
	recipeCreate: <RecipeCreatePage />,
	recipeDetail: <RecipeDetailPage />,
	recipes: <RecipesPage />,
	runs: <RunsPage />,
	settings: <SettingsPage />,
	settingsExecutionIdentityBadges: <ExecutionIdentityBadgeLabPage />,
	skills: <SkillsPage />,
	telemetry: <TelemetryPage />,
};

const router = createBrowserRouter([
	{
		children: FRONTEND_ROUTE_IDS.map((id) => ({
			element: routeElements[id],
			path: FRONTEND_ROUTE_PATHS[id],
		})),
		element: <RootLayout />,
	},
]);

export function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<ThemeApplicator>
				<RealtimeInvalidator />
				<RouterProvider router={router} />
				<ThemedToaster />
			</ThemeApplicator>
		</QueryClientProvider>
	);
}
