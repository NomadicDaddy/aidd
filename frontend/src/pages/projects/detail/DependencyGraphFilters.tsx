import {
	FilterSearch,
	FilterSelect,
	FilterToolbar,
} from '../../../components/shared/FilterToolbar.tsx';
import { CardHeader } from '../../../components/ui/card.tsx';
import { GraphDiagnostics, GraphZoomControls } from './dependencyGraphComponents.tsx';
import { type buildFeatureDependencyGraph } from './dependencyGraphUtils.ts';
import { FEATURE_STATUS_FILTER_OPTIONS } from './featuresUtils.ts';

// The graph tab's header, counts, zoom controls and four filters. Extracted from DependencyGraphTab
// so both files stay inside the 300-line cap.
export function DependencyGraphFilters({
	graph,
	hasFilters,
	milestoneFilter,
	milestoneOptions,
	onMilestoneFilterChange,
	onQueryChange,
	onResetFilters,
	onResetZoom,
	onSourceFilterChange,
	onStatusFilterChange,
	onZoomIn,
	onZoomOut,
	query,
	sourceFilter,
	sourceOptions,
	statusFilter,
	visibleCount,
	zoom,
}: {
	graph: ReturnType<typeof buildFeatureDependencyGraph>;
	hasFilters: boolean;
	milestoneFilter: string;
	milestoneOptions: { label: string; value: string }[];
	onMilestoneFilterChange: (value: string) => void;
	onQueryChange: (value: string) => void;
	onResetFilters: () => void;
	onResetZoom: () => void;
	onSourceFilterChange: (value: string) => void;
	onStatusFilterChange: (value: string) => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	query: string;
	sourceFilter: string;
	sourceOptions: { label: string; value: string }[];
	statusFilter: string;
	visibleCount: number;
	zoom: number;
}) {
	return (
		<FilterToolbar
			// Fixed rem columns clipped the longest option labels below xl; the filters wrap to two
			// rows and each select sizes to its column.
			columns="sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_repeat(3,minmax(9rem,1fr))]"
			filtered={visibleCount}
			hasFilters={hasFilters}
			header={
				// Zoom stays in the header because it is not a filter. Reset filters moved down to
				// the toolbar's own footer, where every other filter row keeps it.
				//
				// Untitled, unlike it once was. One thing was named three ways inside 250px: the tab
				// read `Dependencies`, the intro heading `Dependency graph`, and this header
				// `Feature Dependencies` — the only Title-Cased-Second-Word heading on a surface
				// whose sibling cards are all sentence case. The tab strip and the panel's own
				// heading now carry the single name; a filter toolbar that titles itself is
				// something no other tab on this page does.
				<CardHeader
					action={
						<GraphZoomControls
							onReset={onResetZoom}
							onZoomIn={onZoomIn}
							onZoomOut={onZoomOut}
							zoom={zoom}
						/>
					}
					badge={<GraphDiagnostics graph={graph} />}
					className="mb-0"
				/>
			}
			noun="features"
			onReset={onResetFilters}
			total={graph.nodes.length}>
			<FilterSearch
				ariaLabel="Search dependency graph"
				onChange={onQueryChange}
				placeholder="Filter dependencies"
				value={query}
			/>
			{/* Source and Milestone were the other way round here, and the Features tab beside this
			    one has the same four controls: switching tabs moved the select the operator had
			    just used. The order is `FILTER_FIELD_ORDER`, on both. */}
			<FilterSelect
				label="Status"
				onChange={onStatusFilterChange}
				options={FEATURE_STATUS_FILTER_OPTIONS.map((status) => ({
					label: status === 'all' ? 'All statuses' : status,
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
				options={[{ label: 'All sources', value: 'all' }, ...sourceOptions]}
				value={sourceFilter}
			/>
		</FilterToolbar>
	);
}
