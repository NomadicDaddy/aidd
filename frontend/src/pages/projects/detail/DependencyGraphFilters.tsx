import { FilterSearch, FilterSelect } from '../../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../../components/shared/FilterToolbar.tsx';
import { CardHeader } from '../../../components/ui/card.tsx';
import { countActiveFilters } from '../../../lib/filterFields.ts';
import { humanizeEnum } from '../../../lib/formatters.ts';
import { DEPENDENCY_ORDER_OPTIONS } from './dependencyFilterRegister.ts';
import { GraphDiagnostics } from './dependencyGraphComponents.tsx';
import {
	type buildFeatureDependencyGraph,
	type DependencyGraphNodeOrder,
} from './dependencyGraphUtils.ts';
import { FEATURE_STATUS_FILTER_OPTIONS } from './featuresUtils.ts';
import { featureSourceDisplayLabel } from './shared.ts';

// The graph tab's header, counts, ordering and four filters. Extracted from DependencyGraphTab so
// both files stay inside the 300-line cap.
export function DependencyGraphFilters({
	graph,
	hasFilters,
	milestoneFilter,
	milestoneOptions,
	onMilestoneFilterChange,
	onOrderChange,
	onQueryChange,
	onResetFilters,
	onSourceFilterChange,
	onStatusFilterChange,
	order,
	query,
	sourceFilter,
	sourceOptions,
	statusFilter,
	visibleCount,
	visibleGraph,
}: {
	graph: ReturnType<typeof buildFeatureDependencyGraph>;
	hasFilters: boolean;
	milestoneFilter: string;
	milestoneOptions: { label: string; value: string }[];
	onMilestoneFilterChange: (value: string) => void;
	onOrderChange: (value: DependencyGraphNodeOrder) => void;
	onQueryChange: (value: string) => void;
	onResetFilters: () => void;
	onSourceFilterChange: (value: string) => void;
	onStatusFilterChange: (value: string) => void;
	order: DependencyGraphNodeOrder;
	query: string;
	sourceFilter: string;
	sourceOptions: { label: string; value: string }[];
	statusFilter: string;
	visibleCount: number;
	visibleGraph: ReturnType<typeof buildFeatureDependencyGraph>;
}) {
	return (
		<FilterToolbar
			activeFilterCount={countActiveFilters(
				order !== 'connections',
				statusFilter !== 'all',
				milestoneFilter !== 'all',
				sourceFilter !== 'all',
			)}
			// Fixed rem columns clipped the longest option labels below xl; the filters wrap to two
			// rows and each select sizes to its column.
			columns="@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[minmax(12rem,1fr)_repeat(4,minmax(9rem,1fr))]"
			filtered={visibleCount}
			hasFilters={hasFilters}
			header={
				// Untitled. A title here would name one thing three ways inside 250px: the tab reads
				// `Dependencies`, the intro heading `Dependency graph`, and a header `Feature
				// Dependencies` would be the only Title-Cased-Second-Word heading on a surface whose
				// sibling cards are all sentence case. The tab strip and the panel's own heading carry
				// the single name; a filter toolbar that titles itself is something no other tab on
				// this page does.
				<CardHeader
					badge={<GraphDiagnostics graph={graph} visibleGraph={visibleGraph} />}
					className="mb-0"
				/>
			}
			mobileCountPlacement="row"
			noun="features"
			onReset={onResetFilters}
			primaryControlCount={1}
			total={graph.nodes.length}>
			<FilterSearch
				ariaLabel="Search dependency graph"
				onChange={onQueryChange}
				placeholder="Filter dependencies"
				value={query}
			/>
			<FilterSelect
				label="Order"
				onChange={(value) => onOrderChange(value as DependencyGraphNodeOrder)}
				options={DEPENDENCY_ORDER_OPTIONS}
				value={order}
			/>
			<FilterSelect
				label="Status"
				onChange={onStatusFilterChange}
				options={FEATURE_STATUS_FILTER_OPTIONS.map((status) => ({
					label: status === 'all' ? 'All statuses' : humanizeEnum(status),
					value: status,
				}))}
				value={statusFilter}
			/>
			<FilterSelect
				label="Milestone"
				onChange={onMilestoneFilterChange}
				options={[{ label: 'All milestones', value: 'all' }, ...milestoneOptions]}
				value={milestoneFilter}
			/>
			<FilterSelect
				label="Source"
				onChange={onSourceFilterChange}
				options={[
					{ label: 'All sources', value: 'all' },
					...sourceOptions.map((option) => ({
						...option,
						label: featureSourceDisplayLabel(option.label),
					})),
				]}
				value={sourceFilter}
			/>
			{/* Source and Milestone were the other way round here, and the Features tab beside this
			    one has the same four controls: switching tabs moved the select the operator had
			    just used. The order is `FILTER_FIELD_ORDER`, on both. */}
		</FilterToolbar>
	);
}
