import type { ReactNode } from 'react';

import type { CandidateSignalFilter } from './projectImportCandidates.ts';

import { FilterSearch, FilterSelect } from '../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../components/shared/FilterToolbar.tsx';
import { countActiveFilters } from '../../lib/filterFields.ts';

const SIGNAL_OPTIONS: { label: string; value: CandidateSignalFilter }[] = [
	{ label: 'All signals', value: 'all' },
	{ label: 'Has .aidd', value: 'aidd' },
	{ label: 'Git repository', value: 'git' },
	{ label: 'Has package.json', value: 'packageJson' },
	{ label: 'Directory only', value: 'directory' },
];

export function ProjectIngestFilters({
	actions,
	filtered,
	header,
	onQueryChange,
	onReset,
	onRootChange,
	onSignalChange,
	query,
	readoutSuffix,
	root,
	roots,
	signal,
	total,
}: {
	actions: ReactNode;
	filtered: number;
	header: ReactNode;
	onQueryChange: (value: string) => void;
	/** Owned by the lane, so the toolbar and the empty state clear the same three values. */
	onReset: () => void;
	onRootChange: (value: string) => void;
	onSignalChange: (value: CandidateSignalFilter) => void;
	query: string;
	readoutSuffix: ReactNode;
	root: string;
	roots: string[];
	signal: CandidateSignalFilter;
	total: number;
}) {
	const hasFilters = query !== '' || root !== '' || signal !== 'all';
	return (
		<FilterToolbar
			actionLayout="stacked"
			actionRole="bulk"
			actions={actions}
			activeFilterCount={countActiveFilters(root !== '', signal !== 'all')}
			columns="@min-[36rem]:grid-cols-2 @min-[48rem]:grid-cols-[minmax(16rem,2fr)_minmax(12rem,1fr)_minmax(12rem,1fr)]"
			filtered={filtered}
			hasFilters={hasFilters}
			header={header}
			noun="candidates"
			onReset={onReset}
			primaryControlCount={1}
			readoutSuffix={readoutSuffix}
			total={total}>
			<FilterSearch
				onChange={onQueryChange}
				placeholder="Search name, path, or root"
				value={query}
			/>
			<FilterSelect
				label="Root"
				onChange={onRootChange}
				options={[
					{ label: 'All configured roots', value: '' },
					...roots.map((value) => ({ label: value, value })),
				]}
				value={root}
			/>
			<FilterSelect
				label="Signal"
				onChange={(value) => onSignalChange(value as CandidateSignalFilter)}
				options={SIGNAL_OPTIONS}
				value={signal}
			/>
		</FilterToolbar>
	);
}
