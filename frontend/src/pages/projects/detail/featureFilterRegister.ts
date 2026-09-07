import type { FilterRegister } from '../../../lib/filterFields.ts';

import { filterRegister } from '../../../lib/filterFields.ts';
import { humanizeEnum } from '../../../lib/formatters.ts';
import { featureSourceDisplayLabel } from './shared.ts';

type Option = { label: string; value: string };

/**
 * The Features tab's filtered-to-nothing register.
 *
 * It takes the toolbar's own option lists rather than the raw URL parameters because three of the
 * five filters are stored as something other than what the control shows: priority `2` reads `P2`,
 * an unassigned milestone is a sentinel string, and a source label passes through its own display
 * mapping. Built from the parameters alone, the empty state would name filters the toolbar does not.
 */
export function featureFilterRegister(
	values: {
		milestoneFilter: string;
		priorityFilter: string;
		query: string;
		sourceFilter: string;
		statusFilter: string;
	},
	options: {
		filterMilestoneOptions: Option[];
		filterPriorityOptions: Option[];
		sourceOptions: Option[];
	},
	onReset: () => void,
): FilterRegister | undefined {
	function label(list: Option[], value: string): string {
		return list.find((option) => option.value === value)?.label ?? value;
	}
	return filterRegister(onReset, [
		values.query.trim() !== '' && { label: 'Search', value: values.query.trim() },
		values.statusFilter !== 'all' && {
			label: 'Status',
			value: humanizeEnum(values.statusFilter),
		},
		values.priorityFilter !== 'all' && {
			label: 'Priority',
			value: label(options.filterPriorityOptions, values.priorityFilter),
		},
		values.milestoneFilter !== 'all' && {
			label: 'Milestone',
			value: label(options.filterMilestoneOptions, values.milestoneFilter),
		},
		values.sourceFilter !== 'all' && {
			label: 'Source',
			value: featureSourceDisplayLabel(label(options.sourceOptions, values.sourceFilter)),
		},
	]);
}
