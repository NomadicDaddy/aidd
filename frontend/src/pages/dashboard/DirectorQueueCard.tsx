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
						className="rounded-md border border-border bg-card/75 p-3 transition-[border-color,background-color] duration-150 hover:border-teal-300 hover:bg-teal-50/50 dark:hover:border-teal-800 dark:hover:bg-teal-950/20"
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
								{suggestion.riskLevel}
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
