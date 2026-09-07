import { useState } from 'react';

import type { FilterRegister } from '../../../lib/filterFields.ts';
import type { HealthFilter } from '../auditsUtils.ts';

import { filterRegister } from '../../../lib/filterFields.ts';

type EnabledFilter = 'all' | 'disabled' | 'enabled';

/**
 * The three values the audit catalog toolbar owns, their single reset, and the register the empty
 * state reads them back through.
 *
 * They were three `useState` calls in `CatalogTab` and a second copy of the reset inlined in
 * `CatalogToolbar`'s `onReset`, a file away from the state it cleared. A filter added to the toolbar
 * had to be wired into both, and the table's empty state below could name neither.
 */
export function useCatalogFilters(): {
	enabledFilter: EnabledFilter;
	healthFilter: HealthFilter;
	query: string;
	register: FilterRegister | undefined;
	reset: () => void;
	setEnabledFilter: (value: EnabledFilter) => void;
	setHealthFilter: (value: HealthFilter) => void;
	setQuery: (value: string) => void;
} {
	const [query, setQuery] = useState('');
	const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
	const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>('all');

	function reset(): void {
		setQuery('');
		setHealthFilter('all');
		setEnabledFilter('all');
	}

	return {
		enabledFilter,
		healthFilter,
		query,
		register: filterRegister(reset, [
			query.trim() !== '' && { label: 'Search', value: query.trim() },
			enabledFilter !== 'all' && { label: 'State', value: enabledFilter },
			healthFilter !== 'all' && { label: 'Health', value: healthFilter },
		]),
		reset,
		setEnabledFilter,
		setHealthFilter,
		setQuery,
	};
}
