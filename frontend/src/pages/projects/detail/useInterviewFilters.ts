import { useState } from 'react';

import type { FilterRegister } from '../../../lib/filterFields.ts';

import { filterRegister } from '../../../lib/filterFields.ts';

/**
 * The unanswered-questions filters, the page they reset, and the register the empty state below
 * them reads back.
 *
 * Every writer resets the page for the reason the Features tab gives: a narrower filter can strand
 * the reader past the end of the result, and a page that no longer exists reads as an empty list
 * rather than as a filter. Holding the three values in one place is what lets a single reset clear
 * all of them, and what lets the empty state name what it cleared — the tab previously spelled the
 * reset out a third time, inline, next to two handlers that each cleared the page by hand.
 */
export function useInterviewFilters(): {
	priorityFilter: string;
	query: string;
	register: FilterRegister | undefined;
	resetFilters: () => void;
	setPriorityFilter: (value: string) => void;
	setQuery: (value: string) => void;
	setUnansweredPage: (value: number) => void;
	unansweredPage: number;
} {
	const [unansweredPage, setUnansweredPage] = useState(0);
	const [priorityFilter, setPriority] = useState('all');
	const [query, setQueryValue] = useState('');

	function setPriorityFilter(value: string): void {
		setPriority(value);
		setUnansweredPage(0);
	}

	function setQuery(value: string): void {
		setQueryValue(value);
		setUnansweredPage(0);
	}

	function resetFilters(): void {
		setQueryValue('');
		setPriority('all');
		setUnansweredPage(0);
	}

	return {
		priorityFilter,
		query,
		register: filterRegister(resetFilters, [
			query.trim() !== '' && { label: 'Search', value: query.trim() },
			priorityFilter !== 'all' && { label: 'Priority', value: priorityFilter },
		]),
		resetFilters,
		setPriorityFilter,
		setQuery,
		setUnansweredPage,
		unansweredPage,
	};
}
