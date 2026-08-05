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

function getSuggestionTone(suggestion: SuggestionRecord): 'amber' | 'red' | 'teal' {
	if (suggestion.riskLevel === 'HIGH') return 'red';
	if (suggestion.riskLevel === 'MEDIUM') return 'amber';
	return 'teal';
}

// The badge read 'HIGH' beside a Feature Queue badge reading 'P1', so two vocabularies for two
// different concepts sat one card apart looking like one concept. Naming the axis is what
// separates them; risk is not priority, so it does not become a P-number.
function riskBadgeLabel(risk: SuggestionRecord['riskLevel']): string {
	if (risk === 'HIGH') return 'High risk';
	if (risk === 'MEDIUM') return 'Medium risk';
	return 'Low risk';
}

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
				description="Pending director suggestions awaiting a decision."
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
						No pending suggestions.
					</EmptyState>
				)}
				{suggestions.slice(0, 4).map((suggestion) => (
					<div
						className="rounded-md border border-border bg-card/75 p-3 transition-[border-color,background-color] duration-150 hover:border-accent/40 hover:bg-accent-muted/60"
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
							<Badge showDot tone={getSuggestionTone(suggestion)}>
								{riskBadgeLabel(suggestion.riskLevel)}
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
