import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left';
import { default as BookOpen } from 'lucide-react/dist/esm/icons/book-open';
import { default as Bug } from 'lucide-react/dist/esm/icons/bug';
import { default as Code2 } from 'lucide-react/dist/esm/icons/code-2';
import { default as FileJson } from 'lucide-react/dist/esm/icons/file-json';
import { default as GitBranch } from 'lucide-react/dist/esm/icons/git-branch';
import { default as History } from 'lucide-react/dist/esm/icons/history';
import { default as LayoutDashboard } from 'lucide-react/dist/esm/icons/layout-dashboard';
import { default as ListChecks } from 'lucide-react/dist/esm/icons/list-checks';
import { default as MessageCircle } from 'lucide-react/dist/esm/icons/message-circle';
import { default as Network } from 'lucide-react/dist/esm/icons/network';
import { default as NotebookPen } from 'lucide-react/dist/esm/icons/notebook-pen';
import { default as Settings2 } from 'lucide-react/dist/esm/icons/settings-2';
import { default as ShieldAlert } from 'lucide-react/dist/esm/icons/shield-alert';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ApiError } from '../../api/client.ts';
import { AppLaunchControl } from '../../components/shared/AppLaunchControl.tsx';
import { LoadingState } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { TabList, TabPanel } from '../../components/ui/tabs.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import {
	useProject,
	useProjectGitStatus,
	useProjectInterview,
	useProjectReports,
} from '../../hooks/useProjects.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { ActiveRunsBanner } from './detail/ActiveRunsBanner.tsx';
import { ArtifactsTab } from './detail/ArtifactsTab.tsx';
import { AuditsTab } from './detail/AuditsTab.tsx';
import { BlueprintImplementationCard } from './detail/BlueprintImplementationCard.tsx';
import { CodeTab } from './detail/CodeTab.tsx';
import { DependencyGraphTab } from './detail/DependencyGraphTab.tsx';
import { DiaryTab } from './detail/DiaryTab.tsx';
import { FeaturesTab } from './detail/FeaturesTab.tsx';
import { HistoryTab } from './detail/HistoryTab.tsx';
import { InterviewTab } from './detail/InterviewTab.tsx';
import { ManagementTab } from './detail/ManagementTab.tsx';
import { MaturityOverview } from './detail/MaturityOverview.tsx';
import { NotesTab } from './detail/NotesTab.tsx';
import { OverviewMetadata, OverviewSummary } from './detail/OverviewTab.tsx';
import { ProfileTab } from './detail/ProfileTab.tsx';
import {
	type DetailTab,
	projectDetailTabSearchParams,
	readProjectDetailTab,
} from './detail/projectDetailNavigation.ts';
import { RecentActivity } from './detail/RecentActivity.tsx';
import { ReportsTab } from './detail/ReportsTab.tsx';
import { RepositoryTab } from './detail/RepositoryTab.tsx';
import { RunsTab } from './detail/RunsTab.tsx';
import { artifactTone } from './detail/shared.ts';
import { useCanonicalProjectRoute } from './detail/useCanonicalProjectRoute.ts';
import { GitStatusBadge } from './GitStatusBadge.tsx';
import { OpenInTerminalButton } from './OpenInTerminalButton.tsx';
import { bucketLabels, profileBucketTone } from './projects-list-shared.ts';

const PROJECT_TABS = [
	{ icon: LayoutDashboard, id: 'overview', label: 'Overview' },
	{ icon: ListChecks, id: 'features', label: 'Features' },
	{ icon: Network, id: 'dependencies', label: 'Dependencies' },
	{ icon: Activity, id: 'runs', label: 'Runs' },
	{ icon: History, id: 'history', label: 'History' },
	{ icon: GitBranch, id: 'repository', label: 'Repository' },
	{ icon: Code2, id: 'code', label: 'Code' },
	{ icon: BookOpen, id: 'diary', label: 'Diary' },
	{ icon: NotebookPen, id: 'notes', label: 'Notes' },
	{ icon: FileJson, id: 'artifacts', label: 'Artifacts' },
	{ icon: MessageCircle, id: 'interview', label: 'Interview' },
	{ icon: Bug, id: 'reports', label: 'Reports' },
	{ icon: ShieldAlert, id: 'audits', label: 'Audits' },
	{ icon: ShieldCheck, id: 'profile', label: 'Profile' },
	{ icon: Settings2, id: 'management', label: 'Management' },
] as const satisfies readonly {
	icon: typeof FileJson;
	id: DetailTab;
	label: string;
}[];

export function ProjectDetailPage() {
	const params = useParams();
	const project = useProject(params.id);
	const gitStatus = useProjectGitStatus(params.id);
	const interview = useProjectInterview(params.id);
	const reports = useProjectReports(params.id);
	const [searchParams, setSearchParams] = useSearchParams();
	const canonicalRouteId = project.data?.routeId;
	useCanonicalProjectRoute(params.id, canonicalRouteId);
	const tab = readProjectDetailTab(searchParams.get('tab'));
	useDocumentTitle(project.data ? `${project.data.name} · Projects` : 'Project');
	const notFound = project.error instanceof ApiError && project.error.status === 404;
	if (notFound) {
		return (
			<div className="space-y-5">
				<Link
					className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-neutral-50"
					to="/projects">
					<ArrowLeft className="h-4 w-4" />
					Projects
				</Link>
				<Card>
					<h1 className="text-foreground text-xl font-semibold">Project not found</h1>
					<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
						No project matches this URL. The project may have been removed or the link
						may be incorrect.
					</p>
					<div className="mt-4">
						<Link to="/projects">
							<Button>Back to Projects</Button>
						</Link>
					</div>
				</Card>
			</div>
		);
	}
	const detail = project.data;
	if (!detail) {
		return <LoadingState message="Loading project…" />;
	}
	const artifactCheckSummary = detail.metadata.artifactCheck;
	return (
		<div className="page-reveal space-y-5">
			<PageHeader
				actions={
					<div className="flex flex-wrap items-center gap-1.5">
						<AppLaunchControl projectId={detail.id} />
						<OpenInTerminalButton path={detail.path} />
						<Badge tone={artifactTone[detail.artifactHealth]}>
							{detail.artifactHealth}
						</Badge>
						<Badge tone="neutral">{detail.phase}</Badge>
						{detail.metadata.roadmap?.currentMilestone ? (
							<Badge tone="cyan">{detail.metadata.roadmap.currentMilestone}</Badge>
						) : null}
						<Badge tone={profileBucketTone(detail.metadata.profile.bucket)}>
							{bucketLabels[detail.metadata.profile.bucket]}
						</Badge>
						<GitStatusBadge className="max-w-[14rem]" status={gitStatus.data?.status} />
						<Badge
							tone={
								detail.metadata.profile.source === 'explicit' ? 'cyan' : 'neutral'
							}>
							{detail.metadata.profile.source}
						</Badge>
					</div>
				}
				breadcrumb={
					<Link className="inline-flex items-center gap-1 hover:underline" to="/projects">
						<ArrowLeft className="h-3.5 w-3.5" />
						Projects
					</Link>
				}
				description={<span className="break-all">{detail.path}</span>}
				helpSlug="projects"
				title={detail.name}
			/>
			<ActiveRunsBanner projectPath={detail.path} />
			<TabList
				activeTab={tab}
				ariaLabel="Project sections"
				idPrefix="project-detail"
				onChange={(nextTab) => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'project.tab.change',
						source: 'ProjectDetailPage',
						summary: { projectId: detail.id, tab: nextTab },
					});
					setSearchParams(projectDetailTabSearchParams(searchParams, nextTab), {
						replace: false,
					});
				}}
				tabs={PROJECT_TABS}
			/>
			<TabPanel activeTab={tab} id="overview" idPrefix="project-detail">
				<div className="space-y-3">
					<BlueprintImplementationCard project={detail} />
					<MaturityOverview
						maturity={detail.maturityDetail}
						projectId={detail.id}
						projectPath={detail.path}
					/>
					<OverviewSummary project={detail} />
					<div className="grid gap-3 xl:grid-cols-3">
						<div className="xl:col-span-2">
							<OverviewMetadata metadata={detail.metadata} />
						</div>
						<RecentActivity metadata={detail.metadata} projectPath={detail.path} />
					</div>
				</div>
			</TabPanel>
			<TabPanel activeTab={tab} id="features" idPrefix="project-detail">
				<FeaturesTab
					features={detail.features}
					projectId={detail.id}
					projectPath={detail.path}
					roadmap={detail.metadata.roadmap}
				/>
			</TabPanel>
			<TabPanel activeTab={tab} id="dependencies" idPrefix="project-detail">
				<DependencyGraphTab
					features={detail.features}
					projectId={detail.id}
					projectPath={detail.path}
					roadmap={detail.metadata.roadmap}
				/>
			</TabPanel>
			<TabPanel activeTab={tab} id="runs" idPrefix="project-detail">
				<RunsTab
					localIterations={detail.metadata.localIterations}
					localRuns={detail.metadata.localRuns}
					projectPath={detail.path}
					usage={detail.metadata.usage}
				/>
			</TabPanel>
			<TabPanel activeTab={tab} id="history" idPrefix="project-detail">
				<HistoryTab
					features={detail.features}
					localIterations={detail.metadata.localIterations}
					localRuns={detail.metadata.localRuns}
					projectId={detail.id}
					projectPath={detail.path}
				/>
			</TabPanel>
			<TabPanel activeTab={tab} id="repository" idPrefix="project-detail">
				<RepositoryTab gitStatus={gitStatus.data?.status} projectId={detail.id} />
			</TabPanel>
			<TabPanel activeTab={tab} id="code" idPrefix="project-detail">
				<CodeTab projectId={detail.id} />
			</TabPanel>
			<TabPanel activeTab={tab} id="diary" idPrefix="project-detail">
				<DiaryTab projectName={detail.name} projectPath={detail.path} />
			</TabPanel>
			<TabPanel activeTab={tab} id="notes" idPrefix="project-detail">
				<NotesTab projectId={detail.id} />
			</TabPanel>
			<TabPanel activeTab={tab} id="artifacts" idPrefix="project-detail">
				<ArtifactsTab
					artifactCheck={artifactCheckSummary}
					artifactHealth={detail.artifactHealth}
					maturity={detail.maturityDetail}
					projectId={detail.id}
				/>
			</TabPanel>
			<TabPanel activeTab={tab} id="interview" idPrefix="project-detail">
				<InterviewTab
					interview={interview.data}
					isError={interview.isError}
					isLoading={interview.isLoading}
					projectId={detail.id}
				/>
			</TabPanel>
			<TabPanel activeTab={tab} id="reports" idPrefix="project-detail">
				<ReportsTab
					isError={reports.isError}
					isLoading={reports.isLoading}
					reports={reports.data}
				/>
			</TabPanel>
			<TabPanel activeTab={tab} id="audits" idPrefix="project-detail">
				<AuditsTab projectId={detail.id} projectName={detail.name} />
			</TabPanel>
			<TabPanel activeTab={tab} id="profile" idPrefix="project-detail">
				<ProfileTab profile={detail.metadata.profile} projectId={detail.id} />
			</TabPanel>
			<TabPanel activeTab={tab} id="management" idPrefix="project-detail">
				<ManagementTab project={detail} />
			</TabPanel>
		</div>
	);
}
