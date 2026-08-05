import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Search } from 'lucide-react/dist/esm/icons/search';

import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { FilterSelect, GraphDiagnostics, GraphZoomControls } from './dependencyGraphComponents.tsx';
import { type buildFeatureDependencyGraph } from './dependencyGraphUtils.ts';
import { FEATURE_STATUS_FILTER_OPTIONS } from './featuresUtils.ts';

// The graph tab's header, counts, zoom controls and four filters. Extracted from DependencyGraphTab
// so both files stay inside the 300-line cap.
export function DependencyGraphFilters({
	graph,
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
		<Card className="space-y-4">
			<CardHeader
				action={
					<div className="flex flex-wrap items-center gap-2">
						<GraphZoomControls
							onReset={onResetZoom}
							onZoomIn={onZoomIn}
							onZoomOut={onZoomOut}
							zoom={zoom}
						/>
						<Button onClick={onResetFilters} variant="secondary">
							<RotateCcw className="h-4 w-4" />
							Reset filters
						</Button>
					</div>
				}
				badge={<GraphDiagnostics graph={graph} visibleCount={visibleCount} />}
				className="mb-0"
				title="Feature Dependencies"
			/>
			{/* Fixed rem columns clipped the longest option labels below xl; the filters now wrap to
			    two rows and each select sizes to its column. */}
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_repeat(3,minmax(9rem,1fr))]">
				<label className="grid gap-1 text-xs font-medium text-muted-foreground">
					<span className={fieldLabelClass}>Search</span>
					<div className="relative">
						<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
						<Input
							aria-label="Search dependency graph"
							className="pl-9"
							onChange={(event) => onQueryChange(event.target.value)}
							placeholder="Filter dependencies"
							value={query}
						/>
					</div>
				</label>
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
					label="Source"
					onChange={onSourceFilterChange}
					options={[{ label: 'All sources', value: 'all' }, ...sourceOptions]}
					value={sourceFilter}
				/>
				<FilterSelect
					label="Milestone"
					onChange={onMilestoneFilterChange}
					options={[{ label: 'All milestones', value: 'all' }, ...milestoneOptions]}
					value={milestoneFilter}
				/>
			</div>
		</Card>
	);
}
