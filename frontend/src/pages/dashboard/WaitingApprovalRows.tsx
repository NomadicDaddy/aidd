import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as Check } from 'lucide-react/dist/esm/icons/check';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import type { FeatureStatusEntry, RunRecord, SuggestionRecord } from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { useDirector } from '../../hooks/useDirector.ts';
import {
	useApproveProjectFeature,
	useUpdateProjectFeatureStatus,
} from '../../hooks/useProjectFeatures.ts';
import { riskLabel, riskTone } from '../../lib/directorConstants.ts';
import { formatRelativeAge } from '../../lib/formatters.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { SuggestionSummary } from './SuggestionSummary.tsx';

/** Item kinds that can appear in the waiting-approval queue. */
export type WaitingApprovalKind = 'run' | 'suggestion' | 'waiting_feature';

/** Label for each item kind, shown as a badge in the row. */
const WAITING_KIND_LABEL: Record<WaitingApprovalKind, string> = {
	run: 'Run awaiting action',
	suggestion: 'Director suggestion',
	waiting_feature: 'Feature awaiting approval',
};

const ROW_CLASS = 'rounded-md border border-border bg-card/75 p-3 ';

/** The suggestion row reads its own width, so it is its own query container. */
const SUGGESTION_ROW_CLASS = `${ROW_CLASS}@container`;

/**
 * The identity line every row shares.
 *
 * The project leads the row. As 11px muted text beneath the item title, a queue mixing three
 * projects reads as three unattributed titles. The kind badge renders only when the visible items
 * actually mix kinds and the distinction is doing work; down a homogeneous queue it is the same
 * amber pill repeated six times.
 *
 * The right-hand column takes the row's decision controls as well as its badges. Stacked on a line
 * of their own below the description, left-aligned, they cost every row a fourth line: at 2250 this
 * card spans the full 1962px content column while its text lays out to about x=1090, so that line
 * and ~40px of height would put Approve and Dismiss under 1250px of nothing, and the full-width
 * divider would make that emptiness read as a gap rather than as margin. On the title line they sit
 * at the card's right edge, which is where the eye already is when it finishes the description.
 */
function RowHeader({
	action,
	age,
	badge,
	kind,
	project,
	showKind,
	title,
}: {
	action?: ReactNode;
	age: string;
	badge?: ReactNode;
	kind: WaitingApprovalKind;
	project: string;
	showKind: boolean;
	title: string;
}) {
	return (
		<div className="flex items-start justify-between gap-3">
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold text-foreground">
					{project}
					<span className="font-normal text-muted-foreground"> · {age}</span>
				</p>
				<p className="mt-0.5 line-clamp-1 text-sm text-foreground">{title}</p>
			</div>
			{/* Wraps rather than `shrink-0`: at `xl` this card is one of two ~488px grid columns,
			    and a rail holding a risk badge, a kind badge and two buttons does not fit beside a
			    title there. Wrapping keeps the rail right-aligned and lets the title truncate
			    instead of the controls overflowing the card. */}
			<div className="flex flex-wrap items-center justify-end gap-2">
				{badge}
				{showKind ? (
					<Badge showDot tone="amber">
						{WAITING_KIND_LABEL[kind]}
					</Badge>
				) : null}
				{action}
			</div>
		</div>
	);
}

/** A suggestion row — manages its own launch/dismiss mutation state. */
export function SuggestionRow({
	showKind,
	suggestion,
}: {
	showKind: boolean;
	suggestion: SuggestionRecord;
}) {
	const { dismissSuggestion, launchSuggestion } = useDirector();
	const isFleetWide = suggestion.projectId === null;
	const pending = launchSuggestion.isPending || dismissSuggestion.isPending;
	return (
		<li className={SUGGESTION_ROW_CLASS}>
			{/* `@container` on the row itself, not a viewport step: this card is one of the dashboard
			    grid's two columns above `xl` and full width below it, and AppLayout's rail swaps
			    make viewport width a bad proxy for content width. The row's own width is the honest
			    signal. Below 44rem of it the summary takes the row and the decision controls move
			    below it on the `gap-2` rhythm — the same 8px the card's rows already use; at
			    1440x900 the row is 508px and the inline rail left the title 208px to wrap in. From
			    44rem up the row is wide enough for both (748px at 1920x1200) and the rail returns
			    to its edge. */}
			<div className="flex flex-col gap-2 @min-[44rem]:flex-row @min-[44rem]:items-start @min-[44rem]:gap-3">
				<div className="@min-[44rem]:min-w-48 @min-[44rem]:flex-1">
					<SuggestionSummary
						description={suggestion.description}
						meta={`${suggestion.projectId ?? 'fleet'} · ${formatRelativeAge(new Date(suggestion.createdAt).toISOString())}`}
						title={suggestion.title}
					/>
				</div>
				{/* Stacked below the summary the group starts where the title, meta and description
				    start, which is what the narrow card read as missing; beside the summary again
				    from 44rem it keeps the edge it is aligning to. Either way `flex-wrap` lets the
				    buttons drop to a second rail line rather than clip: at 360 the card is 268px
				    and badge + Approve + Dismiss need 288. */}
				<div className="flex flex-wrap items-center justify-start gap-2 @min-[44rem]:justify-end">
					<Badge showDot tone={riskTone(suggestion.riskLevel)}>
						{riskLabel(suggestion.riskLevel)}
					</Badge>
					{showKind ? (
						<Badge showDot tone="amber">
							{WAITING_KIND_LABEL.suggestion}
						</Badge>
					) : null}
					{/* Approve was solid primary in every row, so a full queue put six saturated
						    CTAs on the dashboard and none of them was the page's actual primary
						    action. */}
					<Button
						aria-label={`Approve (launch) suggestion: ${suggestion.title}`}
						disabled={isFleetWide || pending}
						onClick={() => {
							// Mirrors the Director page: a race lost to the auto-launcher is
							// news, not an error, and the row must not report a failure.
							launchSuggestion.mutate(suggestion.id, {
								onSuccess(outcome) {
									if (outcome.claimedElsewhere) {
										toast.info(
											'Already launched by the Director; nothing new was started',
										);
									}
								},
							});
						}}
						size="compact"
						title={
							isFleetWide
								? 'Fleet-wide suggestions must be launched from the Director queue'
								: undefined
						}
						variant="secondary">
						<Check className="h-3.5 w-3.5" />
						Approve
					</Button>
					<Button
						aria-label={`Dismiss suggestion: ${suggestion.title}`}
						disabled={pending}
						onClick={() => dismissSuggestion.mutate(suggestion.id)}
						size="compact"
						variant="ghost">
						<X className="h-3.5 w-3.5" />
						Dismiss
					</Button>
				</div>
			</div>
		</li>
	);
}

/** A waiting_approval feature row — manages its own approve/status-change mutation state. */
export function WaitingFeatureRow({
	feature,
	projectId,
	projectName,
	showKind,
}: {
	feature: FeatureStatusEntry;
	projectId: string;
	projectName: string;
	showKind: boolean;
}) {
	const approveMutation = useApproveProjectFeature(projectId);
	const dismissMutation = useUpdateProjectFeatureStatus(projectId);
	const pending = approveMutation.isPending || dismissMutation.isPending;
	const title = feature.title ?? feature.id;
	return (
		<li className={ROW_CLASS}>
			<RowHeader
				action={
					<>
						<Button
							aria-label={`Approve feature: ${title}`}
							disabled={pending}
							onClick={() =>
								approveMutation.mutate({
									decisionRequired: false,
									featureId: feature.id,
								})
							}
							size="compact"
							variant="secondary">
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
							variant="ghost">
							<X className="h-3.5 w-3.5" />
							Dismiss
						</Button>
					</>
				}
				age={formatRelativeAge(feature.updatedAt)}
				kind="waiting_feature"
				project={projectName}
				showKind={showKind}
				title={title}
			/>
		</li>
	);
}

/** A blocked run row — informational only (no approve/dismiss actions). */
export function BlockedRunRow({ run, showKind }: { run: RunRecord; showKind: boolean }) {
	return (
		<li className={ROW_CLASS}>
			<RowHeader
				age={formatRelativeAge(new Date(run.startedAt).toISOString())}
				kind="run"
				project={run.projectName}
				showKind={showKind}
				title="Run blocked"
			/>
			<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
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
				className={`mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline ${touchTargetTextClass}`}
				to={`/runs?run=${encodeURIComponent(run.id)}`}>
				View run
				<ArrowRight className="h-3.5 w-3.5" />
			</Link>
		</li>
	);
}
