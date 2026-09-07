import type { FilterRegister } from '../../../lib/filterFields.ts';
import type { DependencyGraphNodeOrder } from './dependencyGraphUtils.ts';

import { filterRegister } from '../../../lib/filterFields.ts';
import { humanizeEnum } from '../../../lib/formatters.ts';
import { featureSourceDisplayLabel } from './shared.ts';

/** The graph's two orderings, shared so the readout below cannot spell one of them differently. */
export const DEPENDENCY_ORDER_OPTIONS: { label: string; value: string }[] = [
	{ label: 'Connections first', value: 'connections' },
	{ label: 'Alphabetical', value: 'alphabetical' },
];

/**
 * The graph's filtered-to-nothing register.
 *
 * It sits in its own module because it needs every option label the toolbar renders — the two
 * orderings, Status humanized from the shared constant, Source through its own display mapping —
 * and the toolbar is a component file. Assembled in the tab from raw state instead, the empty state
 * would have said `alphabetical` where the control says `Alphabetical`.
 */
export function dependencyFilterRegister({
	milestoneFilter,
	milestoneOptions,
	onReset,
	order,
	query,
	sourceFilter,
	sourceOptions,
	statusFilter,
}: {
	milestoneFilter: string;
	milestoneOptions: { label: string; value: string }[];
	onReset: () => void;
	order: DependencyGraphNodeOrder;
	query: string;
	sourceFilter: string;
	sourceOptions: { label: string; value: string }[];
	statusFilter: string;
}): FilterRegister | undefined {
	function optionLabel(options: { label: string; value: string }[], value: string): string {
		return options.find((option) => option.value === value)?.label ?? value;
	}
	return filterRegister(onReset, [
		query.trim() !== '' && { label: 'Search', value: query.trim() },
		order !== 'connections' && {
			label: 'Order',
			value: optionLabel(DEPENDENCY_ORDER_OPTIONS, order),
		},
		statusFilter !== 'all' && { label: 'Status', value: humanizeEnum(statusFilter) },
		milestoneFilter !== 'all' && {
			label: 'Milestone',
			value: optionLabel(milestoneOptions, milestoneFilter),
		},
		sourceFilter !== 'all' && {
			label: 'Source',
			value: featureSourceDisplayLabel(optionLabel(sourceOptions, sourceFilter)),
		},
	]);
}
