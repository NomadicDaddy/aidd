import { lazy } from 'react';

import { LoadingState } from '../../../components/shared/LoadingState.tsx';

/*
 * The project page's tab bodies, loaded when their tab is opened.
 *
 * ProjectDetailPage imported all fifteen statically, and TabPanel renders nothing for an inactive
 * tab, so a visit that only ever showed Overview still downloaded every tab's code: a 418 KB route
 * chunk. Overview stays static because it is what the page opens on. Each path is a literal so the
 * bundler can see it and emit the tab as its own chunk.
 */
export const ArtifactsTab = lazy(() =>
	import('./ArtifactsTab.tsx').then((m) => ({ default: m.ArtifactsTab })),
);
export const AuditsTab = lazy(() =>
	import('./AuditsTab.tsx').then((m) => ({ default: m.AuditsTab })),
);
export const CodeTab = lazy(() => import('./CodeTab.tsx').then((m) => ({ default: m.CodeTab })));
export const DependencyGraphTab = lazy(() =>
	import('./DependencyGraphTab.tsx').then((m) => ({ default: m.DependencyGraphTab })),
);
export const DiaryTab = lazy(() => import('./DiaryTab.tsx').then((m) => ({ default: m.DiaryTab })));
export const FeaturesTab = lazy(() =>
	import('./FeaturesTab.tsx').then((m) => ({ default: m.FeaturesTab })),
);
export const HistoryTab = lazy(() =>
	import('./HistoryTab.tsx').then((m) => ({ default: m.HistoryTab })),
);
export const InterviewTab = lazy(() =>
	import('./InterviewTab.tsx').then((m) => ({ default: m.InterviewTab })),
);
export const ManagementTab = lazy(() =>
	import('./ManagementTab.tsx').then((m) => ({ default: m.ManagementTab })),
);
export const MilestonesTab = lazy(() =>
	import('./MilestonesTab.tsx').then((m) => ({ default: m.MilestonesTab })),
);
export const NotesTab = lazy(() => import('./NotesTab.tsx').then((m) => ({ default: m.NotesTab })));
export const ProfileTab = lazy(() =>
	import('./ProfileTab.tsx').then((m) => ({ default: m.ProfileTab })),
);
export const ReportsTab = lazy(() =>
	import('./ReportsTab.tsx').then((m) => ({ default: m.ReportsTab })),
);
export const RepositoryTab = lazy(() =>
	import('./RepositoryTab.tsx').then((m) => ({ default: m.RepositoryTab })),
);
export const RunsTab = lazy(() => import('./RunsTab.tsx').then((m) => ({ default: m.RunsTab })));

/**
 * What an on-demand tab shows while its chunk loads. The min-height keeps the page from collapsing
 * to one line and jumping back when the tab arrives; Overview is static and never waits on it.
 */
export function LazyTabFallback() {
	return (
		<div className="min-h-96">
			<LoadingState message="Loading tab…" />
		</div>
	);
}
