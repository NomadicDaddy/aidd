import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as ShieldQuestion } from 'lucide-react/dist/esm/icons/shield-question';
import { Link } from 'react-router';

import type { DashboardWaitingFeature, RunRecord, SuggestionRecord } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { LaunchTargetBadge } from '../../components/shared/LaunchTargetControl.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { useDirector } from '../../hooks/useDirector.ts';
import { toneText } from '../../lib/tones.ts';
import { BlockedRunRow, SuggestionRow, WaitingFeatureRow } from './WaitingApprovalRows.tsx';

/**
 * Rows this card will show, and the boundary the Director Queue card reads to find its own content.
 *
 * Suggestions fill the queue before features and runs do, so the first `MAX_ITEMS` pending
 * suggestions are always the ones rendered here and `pendingSuggestions.slice(MAX_ITEMS)` is exactly
 * what this card does not show. Exported so the Director Queue card slices from this boundary
 * rather than taking its own `slice(0, 4)` of the same list, which would print the same four
 * records a second time on the same screen.
 */
export const WAITING_APPROVAL_MAX_ITEMS = 6;

const MAX_ITEMS = WAITING_APPROVAL_MAX_ITEMS;

/**
 * `features` is the server's preview — at most `MAX_ITEMS` of them, which is all this card can
 * ever show — while `featureTotal` is the true count behind the "waiting" badge. Scanning every
 * project's full `featureStatus` in the browser to find these is what this pair replaced.
 */
export function WaitingApprovalCard({
	features,
	featureTotal,
	isLoading,
	runList,
	suggestions,
}: {
	features: DashboardWaitingFeature[];
	featureTotal: number;
	isLoading: boolean;
	runList: RunRecord[];
	suggestions: SuggestionRecord[];
}) {
	const { profile } = useDirector();
	const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
	const blockedRuns = runList.filter(
		(run) => run.status !== 'running' && run.stopReason === 'blocked_needs_user_input',
	);
	const totalItems = pendingSuggestions.length + featureTotal + blockedRuns.length;
	const visibleSuggestions = pendingSuggestions.slice(0, MAX_ITEMS);
	let remaining = MAX_ITEMS - visibleSuggestions.length;
	const visibleFeatures = features.slice(0, Math.max(0, remaining));
	remaining = Math.max(0, remaining - visibleFeatures.length);
	const visibleRuns = blockedRuns.slice(0, remaining);
	const showKind =
		[visibleSuggestions.length, visibleFeatures.length, visibleRuns.length].filter(
			(count) => count > 0,
		).length > 1;

	return (
		<Card aria-labelledby="waiting-approval-heading" variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/director">
						Queue
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				badge={
					<>
						<Badge showDot tone={totalItems > 0 ? 'amber' : 'emerald'}>
							{totalItems} waiting
						</Badge>
						{/* One statement of where approvals launch, instead of the same immutable
						    backend/model pill repeated once per suggestion row. */}
						{profile.data && visibleSuggestions.length > 0 ? (
							<LaunchTargetBadge
								backend={profile.data.backend}
								hint="Suggestion launches use the Director profile (Director → Profile)"
								model={profile.data.model}
								reasoningEffort={profile.data.reasoningEffort}
							/>
						) : null}
					</>
				}
				description="Suggestions, features and runs that cannot advance without a decision."
				icon={
					<ShieldQuestion
						className={`h-4 w-4 ${totalItems > 0 ? toneText.amber : toneText.neutral}`}
					/>
				}
				id="waiting-approval-heading"
				title="Waiting Approval"
			/>
			{isLoading && totalItems === 0 ? (
				<SkeletonLines count={4} label="Loading approval items…" />
			) : totalItems === 0 ? (
				<EmptyState>No items awaiting approval.</EmptyState>
			) : (
				<ul aria-label="Items awaiting approval" className="space-y-2">
					{visibleSuggestions.map((suggestion) => (
						<SuggestionRow
							key={`suggestion:${suggestion.id}`}
							showKind={showKind}
							suggestion={suggestion}
						/>
					))}
					{visibleFeatures.map(({ feature, projectId, projectName }) => (
						<WaitingFeatureRow
							feature={feature}
							key={`feature:${projectId}:${feature.id}`}
							projectId={projectId}
							projectName={projectName}
							showKind={showKind}
						/>
					))}
					{visibleRuns.map((run) => (
						<BlockedRunRow key={`run:${run.id}`} run={run} showKind={showKind} />
					))}
				</ul>
			)}
		</Card>
	);
}
