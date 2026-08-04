import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as Check } from 'lucide-react/dist/esm/icons/check';
import { default as ShieldQuestion } from 'lucide-react/dist/esm/icons/shield-question';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { Link } from 'react-router';

import type {
	ProjectDetail,
	ProjectSummary,
	RunRecord,
	SuggestionRecord,
} from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { LaunchTargetBadge } from '../../components/shared/LaunchTargetControl.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDirector } from '../../hooks/useDirector.ts';
import {
	useApproveProjectFeature,
	useUpdateProjectFeatureStatus,
} from '../../hooks/useProjectFeatures.ts';
import { formatRelativeAge } from '../../lib/formatters.ts';

/** Item kinds that can appear in the waiting-approval queue. */
export type WaitingApprovalKind = 'run' | 'suggestion' | 'waiting_feature';

/** Label for each item kind, shown as a badge in the row. */
const WAITING_KIND_LABEL: Record<WaitingApprovalKind, string> = {
	run: 'Run awaiting action',
	suggestion: 'Director suggestion',
	waiting_feature: 'Feature awaiting approval',
};

const MAX_ITEMS = 6;

const ROW_CLASS = 'rounded-md border border-border bg-card/75 p-3 ';

/** A suggestion row — manages its own launch/dismiss mutation state. */
function SuggestionRow({ suggestion }: { suggestion: SuggestionRecord }) {
	const { dismissSuggestion, launchSuggestion, profile } = useDirector();
	const isFleetWide = suggestion.projectId === null;
	const pending = launchSuggestion.isPending || dismissSuggestion.isPending;
	return (
		<li className={ROW_CLASS}>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="line-clamp-2 text-sm font-semibold text-foreground">
						{suggestion.title}
					</p>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{suggestion.projectId ?? 'fleet'} ·{' '}
						{formatRelativeAge(new Date(suggestion.createdAt).toISOString())}
					</p>
				</div>
				<Badge showDot tone="amber">
					{WAITING_KIND_LABEL.suggestion}
				</Badge>
			</div>
			<p className="mt-1 line-clamp-2 text-sm text-foreground">{suggestion.description}</p>
			<div className="mt-2 flex items-center gap-2">
				<Button
					aria-label={`Approve (launch) suggestion: ${suggestion.title}`}
					disabled={isFleetWide || pending}
					onClick={() => launchSuggestion.mutate(suggestion.id)}
					size="compact"
					title={
						isFleetWide
							? 'Fleet-wide suggestions must be launched from the Director queue'
							: undefined
					}
					variant="primary">
					<Check className="h-3.5 w-3.5" />
					Approve
				</Button>
				<Button
					aria-label={`Dismiss suggestion: ${suggestion.title}`}
					disabled={pending}
					onClick={() => dismissSuggestion.mutate(suggestion.id)}
					size="compact"
					variant="danger">
					<X className="h-3.5 w-3.5" />
					Dismiss
				</Button>
				{profile.data ? (
					<LaunchTargetBadge
						backend={profile.data.backend}
						hint="Suggestion launches use the Director profile (Director → Profile)"
						model={profile.data.model}
						reasoningEffort={profile.data.reasoningEffort}
					/>
				) : null}
			</div>
		</li>
	);
}

/** A waiting_approval feature row — manages its own approve/status-change mutation state. */
function WaitingFeatureRow({
	feature,
	projectId,
	projectName,
}: {
	feature: ProjectDetail['features'][number];
	projectId: string;
	projectName: string;
}) {
	const approveMutation = useApproveProjectFeature(projectId);
	const dismissMutation = useUpdateProjectFeatureStatus(projectId);
	const pending = approveMutation.isPending || dismissMutation.isPending;
	const title = feature.title ?? feature.id;
	return (
		<li className={ROW_CLASS}>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="line-clamp-2 text-sm font-semibold text-foreground">{title}</p>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{projectName} · {formatRelativeAge(feature.updatedAt)}
					</p>
				</div>
				<Badge showDot tone="amber">
					{WAITING_KIND_LABEL.waiting_feature}
				</Badge>
			</div>
			<div className="mt-2 flex items-center gap-2">
				<Button
					aria-label={`Approve feature: ${title}`}
					disabled={pending}
					onClick={() =>
						approveMutation.mutate({ decisionRequired: false, featureId: feature.id })
					}
					size="compact"
					variant="primary">
					<Check className="h-3.5 w-3.5" />
					Approve
				</Button>
				<Button
					aria-label={`Dismiss feature: ${title}`}
					disabled={pending}
					onClick={() =>
						dismissMutation.mutate({ featureId: feature.id, status: 'backlog' })
					}
					size="compact"
					variant="danger">
					<X className="h-3.5 w-3.5" />
					Dismiss
				</Button>
			</div>
		</li>
	);
}

/** A blocked run row — informational only (no approve/dismiss actions). */
function BlockedRunRow({ run }: { run: RunRecord }) {
	return (
		<li className={ROW_CLASS}>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="line-clamp-2 text-sm font-semibold text-foreground">
						{run.projectName} run blocked
					</p>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{run.projectName} ·{' '}
						{formatRelativeAge(new Date(run.startedAt).toISOString())}
					</p>
				</div>
				<Badge showDot tone="amber">
					{WAITING_KIND_LABEL.run}
				</Badge>
			</div>
			<p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
				{run.summary ?? 'Run stopped: needs user input'}
			</p>
			<ExecutionIdentityBadges
				backend={run.backend}
				className="mt-2"
				model={run.model}
				provider={run.provider}
				reasoningEffort={run.reasoningEffort}
			/>
			<Link
				className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-950 dark:text-teal-300 dark:hover:text-teal-100"
				to={`/runs?run=${encodeURIComponent(run.id)}`}>
				View run
				<ArrowRight className="h-3.5 w-3.5" />
			</Link>
		</li>
	);
}

export function WaitingApprovalCard({
	isLoading,
	projects,
	runList,
	suggestions,
}: {
	isLoading: boolean;
	projects: (ProjectDetail | ProjectSummary)[];
	runList: RunRecord[];
	suggestions: SuggestionRecord[];
}) {
	const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
	const blockedRuns = runList.filter(
		(run) => run.status !== 'running' && run.stopReason === 'blocked_needs_user_input',
	);
	const waitingFeatures: {
		feature: ProjectDetail['features'][number];
		projectId: string;
		projectName: string;
	}[] = [];
	for (const project of projects) {
		if (!('features' in project) || !project.features) continue;
		for (const feature of project.features) {
			if (feature.status === 'waiting_approval') {
				waitingFeatures.push({ feature, projectId: project.id, projectName: project.name });
			}
		}
	}
	const totalItems = pendingSuggestions.length + waitingFeatures.length + blockedRuns.length;
	const visibleSuggestions = pendingSuggestions.slice(0, MAX_ITEMS);
	let remaining = MAX_ITEMS - visibleSuggestions.length;
	const visibleFeatures = waitingFeatures.slice(0, Math.max(0, remaining));
	remaining = Math.max(0, remaining - visibleFeatures.length);
	const visibleRuns = blockedRuns.slice(0, remaining);

	return (
		<Card aria-labelledby="waiting-approval-heading" variant="panel">
			<div className="mb-4 flex items-center justify-between gap-3">
				<div
					className="flex items-center gap-2 text-sm font-semibold text-foreground"
					id="waiting-approval-heading">
					<ShieldQuestion className="h-4 w-4 text-amber-600 dark:text-amber-300" />
					Waiting Approval
					<Badge showDot tone={totalItems > 0 ? 'amber' : 'emerald'}>
						{totalItems}
					</Badge>
				</div>
				<Link
					className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-teal-700 transition-colors outline-none hover:text-teal-950 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-teal-300 dark:hover:text-teal-100 dark:focus-visible:ring-offset-slate-950"
					to="/director">
					Queue
					<ArrowRight className="h-3.5 w-3.5" />
				</Link>
			</div>
			{isLoading && totalItems === 0 ? (
				<SkeletonLines count={4} label="Loading approval items…" />
			) : totalItems === 0 ? (
				<EmptyState>No items awaiting approval.</EmptyState>
			) : (
				<ul aria-label="Items awaiting approval" className="space-y-2">
					{visibleSuggestions.map((suggestion) => (
						<SuggestionRow
							key={`suggestion:${suggestion.id}`}
							suggestion={suggestion}
						/>
					))}
					{visibleFeatures.map(({ feature, projectId, projectName }) => (
						<WaitingFeatureRow
							feature={feature}
							key={`feature:${projectId}:${feature.id}`}
							projectId={projectId}
							projectName={projectName}
						/>
					))}
					{visibleRuns.map((run) => (
						<BlockedRunRow key={`run:${run.id}`} run={run} />
					))}
				</ul>
			)}
		</Card>
	);
}
