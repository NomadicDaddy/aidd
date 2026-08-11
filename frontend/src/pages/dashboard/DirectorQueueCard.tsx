import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { Link } from 'react-router';

import type { SuggestionRecord } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { toneText } from '../../lib/tones.ts';
import { suggestionRiskLabel, suggestionRiskTone } from './dashboard-shared.ts';

/**
 * The pending suggestions the approval queue below does not have room for.
 *
 * `suggestions` is already the overflow — `DashboardPage` slices it past
 * `WAITING_APPROVAL_MAX_ITEMS` — because this card used to take `slice(0, 4)` of the same pending
 * list Waiting Approval renders. At 2250 that printed 'deeper-license-cli / htmx-debugger /
 * astrid.chat / routebook' with their descriptions here and again 726px further down, and the two
 * copies disagreed about what mattered: this one carried the risk badge and no controls, that one
 * carried Approve/Dismiss and no risk. Risk moved to the row that acts on it; this card now shows
 * what is queued behind the decisions rather than a second rendering of them.
 */
export function DirectorQueueCard({
	isLoading,
	suggestions,
}: {
	isLoading: boolean;
	suggestions: SuggestionRecord[];
}) {
	return (
		<Card variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/director">
						Director
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				description="Pending suggestions queued behind the approval list."
				icon={<AlertTriangle className={`h-4 w-4 ${toneText.amber}`} />}
				title="Director Queue"
			/>
			<div className="grid gap-3 lg:grid-cols-2">
				{isLoading && suggestions.length === 0 ? (
					<div className="lg:col-span-2">
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
						className="lg:col-span-2">
						Nothing queued behind the approval list.
					</EmptyState>
				)}
				{suggestions.slice(0, 4).map((suggestion) => (
					<div
						// Neutral tracking, not accent: nothing at row level here acts on a click,
						// and the accent pair is what the page uses to say an element does. See
						// `ProjectHealthRow` for the other half of the same correction.
						className="rounded-md border border-border bg-card/75 p-3 transition-colors duration-150 hover:bg-muted/40"
						key={suggestion.id}>
						<div className="mb-2 flex items-start justify-between gap-3">
							<div className="min-w-0">
								<h3 className="line-clamp-2 text-sm font-semibold text-foreground">
									{suggestion.title}
								</h3>
								<p className="mt-1 truncate text-xs text-muted-foreground">
									{suggestion.projectId ?? 'fleet'} / {suggestion.taskType}
								</p>
							</div>
							<Badge showDot tone={suggestionRiskTone(suggestion.riskLevel)}>
								{suggestionRiskLabel(suggestion.riskLevel)}
							</Badge>
						</div>
						<p className="line-clamp-3 text-sm text-muted-foreground">
							{suggestion.description}
						</p>
					</div>
				))}
			</div>
		</Card>
	);
}
