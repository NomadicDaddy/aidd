import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { Link } from 'react-router';

import type { SuggestionRecord } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { riskLabel, riskTone } from '../../lib/directorConstants.ts';
import { toneText } from '../../lib/tones.ts';
import { SuggestionSummary } from './SuggestionSummary.tsx';

/**
 * The pending suggestions the approval queue below does not have room for.
 *
 * `suggestions` is already the overflow — `DashboardPage` slices it past
 * `WAITING_APPROVAL_MAX_ITEMS`. Taking a `slice(0, 4)` of the same pending list Waiting Approval
 * renders would print 'deeper-license-cli / htmx-debugger / astrid.chat / routebook' with their
 * descriptions here and again 726px further down, and two copies disagree about what matters when
 * one carries the risk badge and no controls while the other carries Approve/Dismiss and no risk.
 * Risk sits on the row that acts on it; this card shows what is queued behind the decisions rather
 * than a second rendering of them.
 */
export function DirectorQueueCard({
	isLoading,
	suggestions,
}: {
	isLoading: boolean;
	suggestions: SuggestionRecord[];
}) {
	return (
		<Card className="@container" variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/director">
						Director
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				description="Pending suggestions queued behind the approval list."
				icon={
					<AlertTriangle
						className={`h-4 w-4 ${suggestions.length > 0 ? toneText.amber : toneText.neutral}`}
					/>
				}
				title="Director Queue"
			/>
			<div className="grid grid-cols-[minmax(0,1fr)] gap-3 @min-[44rem]:grid-cols-2">
				{isLoading && suggestions.length === 0 ? (
					<div className="@min-[44rem]:col-span-2">
						<SkeletonLines count={4} label="Loading suggestions…" />
					</div>
				) : null}
				{!isLoading && suggestions.length === 0 && (
					<EmptyState
						action={
							<Link className={buttonClassName('secondary')} to="/director">
								Open director
								<ArrowRight className="h-3.5 w-3.5" />
							</Link>
						}
						className="@min-[44rem]:col-span-2">
						Nothing queued behind the approval list.
					</EmptyState>
				)}
				{suggestions.slice(0, 4).map((suggestion) => (
					<div
						// Neutral tracking, not accent: nothing at row level here acts on a click,
						// and the accent pair is what the page uses to say an element does. See
						// `ProjectHealthRow` for the other half of the same correction.
						className="min-w-0 rounded-md border border-border bg-card/75 p-3 transition-colors duration-150 hover:bg-muted/40"
						key={suggestion.id}>
						<div className="flex items-start gap-3">
							<div className="min-w-0 flex-1">
								<SuggestionSummary
									description={suggestion.description}
									meta={`${suggestion.projectId ?? 'fleet'} · ${suggestion.taskType}`}
									title={suggestion.title}
								/>
							</div>
							<Badge showDot tone={riskTone(suggestion.riskLevel)}>
								{riskLabel(suggestion.riskLevel)}
							</Badge>
						</div>
					</div>
				))}
			</div>
		</Card>
	);
}
