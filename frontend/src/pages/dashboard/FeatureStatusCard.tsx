import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as ListFilter } from 'lucide-react/dist/esm/icons/list-filter';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { useState } from 'react';
import { Link } from 'react-router';

import type {
	FeatureStatusEntry,
	FeatureStatusType,
	ProjectDetail,
	ProjectFeature,
	ProjectSummary,
} from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { toneText } from '../../lib/tones.ts';
import { type FeatureStatusRow, FeatureStatusRows } from './FeatureStatusRows.tsx';

type FeatureStatusState = 'completed' | 'pending';

type FeatureStatusSourceProject = ProjectDetail | ProjectSummary;

const stateOptions: { label: string; value: FeatureStatusState }[] = [
	{ label: 'Pending', value: 'pending' },
	{ label: 'Completed', value: 'completed' },
];

const typeOptions: { label: string; value: FeatureStatusType }[] = [
	{ label: 'Features', value: 'feature' },
	{ label: 'Remediation', value: 'remediation' },
	{ label: 'Audit', value: 'audit' },
];

function featureDirectory(feature: ProjectFeature): string {
	return feature.directory || feature.id;
}

function featureType(feature: ProjectFeature): FeatureStatusType {
	const directory = featureDirectory(feature);
	if (feature.auditSource || /^audit-[a-z][a-z0-9-]*-\d+-/.test(directory)) return 'audit';
	if (/^remediation(-\d+)?-[a-zA-Z0-9-]+$/.test(directory)) return 'remediation';
	return 'feature';
}

function featureCompleted(feature: ProjectFeature): boolean {
	const type = featureType(feature);
	return type === 'audit'
		? feature.status === 'completed' && feature.passes === true
		: feature.status === 'completed';
}

function statusEntriesFromFeatures(features: ProjectFeature[] | undefined): FeatureStatusEntry[] {
	return (features ?? []).map((feature) => {
		const directory = featureDirectory(feature);
		return {
			completed: featureCompleted(feature),
			directory,
			id: feature.id,
			priority: feature.priority ?? null,
			status: feature.status ?? null,
			title: feature.title ?? directory,
			type: featureType(feature),
		};
	});
}

function statusEntries(project: FeatureStatusSourceProject): FeatureStatusEntry[] {
	if (project.featureStatus?.length > 0) return project.featureStatus;
	if ('features' in project) return statusEntriesFromFeatures(project.features);
	return [];
}

function buildFeatureStatusRows(projects: FeatureStatusSourceProject[]): FeatureStatusRow[] {
	return projects
		.flatMap((project) =>
			statusEntries(project).map((feature) => ({
				completed: feature.completed,
				directory: feature.directory,
				priority: feature.priority,
				projectId: project.routeId,
				projectName: project.name,
				status: feature.status,
				title: feature.title,
				type: feature.type,
			})),
		)
		.sort((left, right) => {
			const projectCompare = left.projectName.localeCompare(right.projectName);
			if (projectCompare !== 0) return projectCompare;
			return left.directory.localeCompare(right.directory);
		});
}

function filteredRows(
	rows: FeatureStatusRow[],
	stateFilter: FeatureStatusState,
	typeFilter: FeatureStatusType,
): FeatureStatusRow[] {
	return rows.filter((row) => {
		if (row.type !== typeFilter) return false;
		return stateFilter === 'completed' ? row.completed : !row.completed;
	});
}

export function FeatureStatusCard({
	isError,
	isLoading,
	onRetry,
	projects,
}: {
	isError: boolean;
	isLoading: boolean;
	onRetry: () => void;
	projects: FeatureStatusSourceProject[];
}) {
	const [stateFilter, setStateFilter] = useState<FeatureStatusState>('pending');
	const [typeFilter, setTypeFilter] = useState<FeatureStatusType>('feature');
	const rows = buildFeatureStatusRows(projects);
	const visibleRows = filteredRows(rows, stateFilter, typeFilter);

	return (
		<Card className="overflow-hidden" variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/projects">
						Projects
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				badge={
					<Badge showDot tone={visibleRows.length > 0 ? 'amber' : 'emerald'}>
						{visibleRows.length} {stateFilter}
					</Badge>
				}
				description="Fleet feature rows by aidd-tools status filter."
				icon={<ListFilter className={`h-4 w-4 ${toneText.teal}`} />}
				title="Feature Status"
			/>

			{/* Two full-width labelled dropdowns took a two-column band the height of three table
			    rows to express five mutually exclusive choices, and neither showed the unselected
			    options. As segmented tracks the whole filter state is visible in one wrapping row. */}
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<SegmentedControl
					ariaLabel="Feature state"
					onChange={setStateFilter}
					options={stateOptions}
					value={stateFilter}
				/>
				<SegmentedControl
					ariaLabel="Feature type"
					onChange={setTypeFilter}
					options={typeOptions}
					value={typeFilter}
				/>
			</div>

			{isLoading && rows.length === 0 ? (
				<SkeletonLines count={6} label="Loading feature status…" />
			) : isError ? (
				<EmptyState
					action={
						<Button className="text-xs" onClick={onRetry} variant="secondary">
							<RefreshCw className="h-3.5 w-3.5" />
							Retry
						</Button>
					}>
					Failed to load feature status.
				</EmptyState>
			) : rows.length === 0 ? (
				<EmptyState
					action={
						<Link className={buttonClassName('secondary')} to="/settings">
							Configure project roots
							<ArrowRight className="h-3.5 w-3.5" />
						</Link>
					}>
					No projects with feature metadata were discovered.
				</EmptyState>
			) : visibleRows.length === 0 ? (
				<EmptyState>
					No {stateFilter} {typeFilter} rows match the selected filters.
				</EmptyState>
			) : (
				<FeatureStatusRows rows={visibleRows} />
			)}
		</Card>
	);
}
