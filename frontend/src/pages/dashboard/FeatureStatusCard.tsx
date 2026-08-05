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
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';

type FeatureStatusState = 'completed' | 'pending';

interface FeatureStatusRow {
	completed: boolean;
	directory: string;
	priority: null | number | string;
	projectId: string;
	projectName: string;
	status: null | string;
	title: string;
	type: FeatureStatusType;
}

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

function priorityLabel(priority: null | number | string): string {
	if (priority === null || priority === '') return 'P-';
	return `P${priority}`;
}

function statusLabel(row: FeatureStatusRow): string {
	if (row.completed) return 'completed';
	return row.status ?? 'pending';
}

function rowLink(row: FeatureStatusRow): string {
	const projectId = encodeURIComponent(row.projectId);
	const query = new URLSearchParams({
		featureQ: row.directory,
		tab: 'features',
	});
	return `/projects/${projectId}?${query.toString()}`;
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

function FeatureStatusTable({ rows }: { rows: FeatureStatusRow[] }) {
	return (
		<div className="-mx-2 max-h-[28rem] overflow-auto px-2">
			<table className="min-w-[760px] text-sm">
				<thead className="sticky top-0 z-10 bg-card">
					<tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase">
						<th className="px-3 py-2 text-left">Application</th>
						<th className="px-3 py-2 text-left">Feature</th>
						<th className="px-3 py-2 text-left">Type</th>
						<th className="px-3 py-2 text-left">State</th>
						<th className="px-3 py-2 text-right">Priority</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr
							className="border-b border-border last:border-b-0"
							key={`${row.projectName}:${row.directory}`}>
							<td className="max-w-44 truncate px-3 py-2 font-medium text-foreground">
								{row.projectName}
							</td>
							<td className="px-3 py-2">
								<Link
									className="group block max-w-[28rem] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
									to={rowLink(row)}>
									<span className="block truncate font-medium text-teal-700 group-hover:text-teal-950 dark:text-teal-300 dark:group-hover:text-teal-100">
										{row.directory}
									</span>
									<span className="mt-0.5 block truncate text-xs text-muted-foreground">
										{row.title}
									</span>
								</Link>
							</td>
							<td className="px-3 py-2">
								<Badge tone={row.type === 'audit' ? 'amber' : 'teal'}>
									{row.type}
								</Badge>
							</td>
							<td className="px-3 py-2 text-foreground">{statusLabel(row)}</td>
							<td className="px-3 py-2 text-right font-medium text-foreground tabular-nums">
								{priorityLabel(row.priority)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
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

			<div className="mb-4 grid gap-3 sm:grid-cols-2">
				<label className="space-y-1">
					<span className={fieldLabelClass}>Status</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setStateFilter(event.target.value as FeatureStatusState)
						}
						value={stateFilter}>
						{stateOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Type</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => setTypeFilter(event.target.value as FeatureStatusType)}
						value={typeFilter}>
						{typeOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
			</div>

			{isLoading && rows.length === 0 ? (
				<SkeletonLines count={6} label="Loading feature status…" />
			) : isError ? (
				<EmptyState
					action={
						<Button className="h-9 text-xs" onClick={onRetry} variant="secondary">
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
				<FeatureStatusTable rows={visibleRows} />
			)}
		</Card>
	);
}
