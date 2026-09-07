import { FilterSearch, FilterSelect } from '../../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../../components/shared/FilterToolbar.tsx';
import { CardHeader } from '../../../components/ui/card.tsx';

export function InterviewFilters({
	filtered,
	onPriorityChange,
	onQueryChange,
	onReset,
	priorities,
	priority,
	query,
	summary,
	total,
}: {
	filtered: number;
	onPriorityChange: (value: string) => void;
	onQueryChange: (value: string) => void;
	onReset: () => void;
	priorities: string[];
	priority: string;
	query: string;
	summary: ReactNode;
	total: number;
}) {
	return (
		<FilterToolbar
			activeFilterCount={countActiveFilters(priority !== 'all')}
			columns="@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_1fr]"
			filtered={filtered}
			hasFilters={query.trim() !== '' || priority !== 'all'}
			header={
				<CardHeader
					className="mb-0"
					headingLevel={3}
					status={summary}
					title="Unanswered questions"
				/>
			}
			noun="questions"
			onReset={onReset}
			primaryControlCount={1}
			total={total}>
			<FilterSearch
				onChange={onQueryChange}
				placeholder="Filter question prompts"
				value={query}
			/>
			<FilterSelect
				label="Priority"
				onChange={onPriorityChange}
				options={[
					{ label: 'All priorities', value: 'all' },
					...priorities.map((value) => ({ label: value, value })),
				]}
				value={priority}
			/>
		</FilterToolbar>
	);
}
import type { ReactNode } from 'react';

import { countActiveFilters } from '../../../lib/filterFields.ts';
