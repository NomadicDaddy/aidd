import { useReducer, useState } from 'react';

import type { DirectorSuggestionRecord } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import {
	ALL_SUGGESTIONS,
	initialSuggestionDisclosureState,
	SUGGESTION_BATCH_SIZE,
	suggestionDisclosureReducer,
	suggestionFilterRegister,
} from './directorDisclosure.ts';
import { DirectorSuggestionFilters } from './DirectorSuggestionFilters.tsx';
import { DirectorSuggestionRow } from './DirectorSuggestionRow.tsx';
import { SuggestionLaunchPreviewDialog } from './SuggestionLaunchPreviewDialog.tsx';

export function DirectorSuggestionsList({
	loading = false,
	onDismiss,
	onLaunch,
	suggestions,
}: {
	loading?: boolean;
	onDismiss: (id: string) => void;
	onLaunch: (id: string) => void;
	suggestions: DirectorSuggestionRecord[];
}) {
	const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
	const [previewSuggestion, setPreviewSuggestion] = useState<DirectorSuggestionRecord | null>(
		null,
	);
	const [disclosure, dispatchDisclosure] = useReducer(
		suggestionDisclosureReducer,
		initialSuggestionDisclosureState,
	);
	const visibleSuggestions = suggestions.filter(
		(suggestion) => suggestion.status !== 'dismissed',
	);
	const filteredSuggestions = visibleSuggestions.filter(
		(suggestion) =>
			(disclosure.taskFilter === ALL_SUGGESTIONS ||
				suggestion.taskType === disclosure.taskFilter) &&
			(disclosure.riskFilter === ALL_SUGGESTIONS ||
				suggestion.riskLevel === disclosure.riskFilter),
	);
	const openCount = visibleSuggestions.filter(
		(suggestion) => suggestion.status === 'pending',
	).length;
	const displayedSuggestions = filteredSuggestions.slice(0, disclosure.visibleCount);
	const hasMoreSuggestions = displayedSuggestions.length < filteredSuggestions.length;
	const showingInitialLoading = loading && suggestions.length === 0;

	function toggleExpanded(id: string): void {
		setExpandedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	return (
		<section aria-labelledby="director-suggestions-heading" className="space-y-3">
			<Card>
				<CardHeader
					badge={
						<Badge showDot tone={openCount > 0 ? 'amber' : 'emerald'}>
							{openCount} open
						</Badge>
					}
					className="mb-0"
					description="Review a suggestion before launching or dismissing it."
					id="director-suggestions-heading"
					title="Suggestions"
				/>
				{!showingInitialLoading && visibleSuggestions.length > 0 ? (
					<DirectorSuggestionFilters
						displayedCount={displayedSuggestions.length}
						onRiskFilterChange={(filter) =>
							dispatchDisclosure({ filter, type: 'set-risk-filter' })
						}
						onTaskFilterChange={(filter) =>
							dispatchDisclosure({ filter, type: 'set-task-filter' })
						}
						riskFilter={disclosure.riskFilter}
						suggestions={visibleSuggestions}
						taskFilter={disclosure.taskFilter}
						totalCount={filteredSuggestions.length}
					/>
				) : null}
				{showingInitialLoading ? (
					<div aria-hidden="true" className="mt-3 h-10 rounded-md bg-muted p-3">
						<Skeleton className="h-4 w-full" />
					</div>
				) : null}
				<div className="mt-3 space-y-2" id="director-suggestion-items">
					{showingInitialLoading ? (
						<div aria-busy="true" aria-live="polite" className="space-y-2">
							<span className="sr-only">Loading suggestions…</span>
							{Array.from({ length: SUGGESTION_BATCH_SIZE }).map((_, index) => (
								<div
									className="min-h-[4.625rem] space-y-2 rounded-md bg-muted p-3"
									data-loading-row="suggestion"
									key={index}>
									<Skeleton className="h-3 w-2/3" />
									<div className="flex gap-2">
										<Skeleton className="h-3 w-24" />
										<Skeleton className="h-3 w-16" />
									</div>
								</div>
							))}
						</div>
					) : null}
					{!showingInitialLoading && visibleSuggestions.length === 0 ? (
						<EmptyState>No suggestions yet. Run a cycle to generate them.</EmptyState>
					) : null}
					{!showingInitialLoading &&
					visibleSuggestions.length > 0 &&
					filteredSuggestions.length === 0 ? (
						<EmptyState
							filters={suggestionFilterRegister(disclosure, () =>
								dispatchDisclosure({ type: 'reset-filters' }),
							)}>
							No suggestions match the selected filters.
						</EmptyState>
					) : null}
					{!showingInitialLoading &&
						displayedSuggestions.map((suggestion) => (
							<DirectorSuggestionRow
								expanded={expandedIds.has(suggestion.id)}
								key={suggestion.id}
								onDismiss={onDismiss}
								onLaunch={onLaunch}
								onPreview={setPreviewSuggestion}
								onToggle={() => toggleExpanded(suggestion.id)}
								suggestion={suggestion}
							/>
						))}
				</div>
				{showingInitialLoading ? (
					<div aria-hidden="true" className="mt-3 border-t border-border pt-3">
						<Skeleton className="h-8 w-full" />
					</div>
				) : null}
				{!showingInitialLoading && filteredSuggestions.length > SUGGESTION_BATCH_SIZE ? (
					<div className="mt-3 border-t border-border pt-3">
						<Button
							aria-controls="director-suggestion-items"
							aria-disabled={!hasMoreSuggestions}
							className="w-full"
							onClick={() => {
								if (!hasMoreSuggestions) return;
								dispatchDisclosure({
									total: filteredSuggestions.length,
									type: 'show-more',
								});
							}}
							size="compact"
							variant="secondary">
							{hasMoreSuggestions
								? `Show ${Math.min(
										SUGGESTION_BATCH_SIZE,
										filteredSuggestions.length - displayedSuggestions.length,
									)} more`
								: 'All suggestions shown'}
						</Button>
					</div>
				) : null}
			</Card>
			{previewSuggestion ? (
				<SuggestionLaunchPreviewDialog
					onClose={() => setPreviewSuggestion(null)}
					suggestion={previewSuggestion}
				/>
			) : null}
		</section>
	);
}
