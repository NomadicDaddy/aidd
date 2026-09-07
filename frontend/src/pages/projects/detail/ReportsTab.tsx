import { useState } from 'react';

import type { ProjectFeature, ProjectReportsResponse } from '../../../api/types.ts';

import { ProjectReportButton } from '../../../components/layout/ProjectReportButton.tsx';
import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { FilterSearch, FilterSelect } from '../../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../../components/shared/FilterToolbar.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { countActiveFilters, filterRegister } from '../../../lib/filterFields.ts';
import { tableColumnClass } from '../../../lib/tableStyles.ts';
import { FeatureDetailsDialog } from './FeatureDetailsDialog.tsx';
import { featureDirectory } from './featuresUtils.ts';
import { clampPage } from './pagination-utils.ts';
import { Pagination } from './Pagination.tsx';
import { ReportsDesktopTable } from './ReportsDesktopTable.tsx';
import { ReportsMobileList } from './ReportsMobileList.tsx';
import { type ReportSort, type ReportSortKey, sortReports } from './reportsUtils.ts';

type ReportKindFilter = 'all' | 'feature' | 'remediation';

const REPORTS_PAGE_SIZE = 12;

export function ReportsTab({
	features,
	isError,
	isLoading,
	projectId,
	reports,
}: {
	features: ProjectFeature[];
	isError: boolean;
	isLoading: boolean;
	projectId: string;
	reports: ProjectReportsResponse | undefined;
}) {
	const [kind, setKind] = useState<ReportKindFilter>('all');
	const [page, setPage] = useState(0);
	const [query, setQuery] = useState('');
	const [sort, setSort] = useState<ReportSort>({ direction: 'desc', key: 'filed' });
	const [selectedFeature, setSelectedFeature] = useState<null | ProjectFeature>(null);
	function resetFilters(): void {
		setKind('all');
		setQuery('');
		setPage(0);
	}
	const emptyFilters = filterRegister(resetFilters, [
		query.trim() !== '' && { label: 'Search', value: query.trim() },
		kind !== 'all' && { label: 'Kind', value: kind },
	]);
	const intro = (
		<TabIntro
			description="Reports submitted from the control panel. Kind comes from the report’s content — a bug report describing a missing capability is filed as a feature."
			title="Reports"
		/>
	);
	if (isLoading) {
		return (
			<div className="space-y-4">
				{intro}
				<LoadingState message="Loading reports…" />
			</div>
		);
	}

	if (isError) {
		return (
			<div className="space-y-4">
				{intro}
				<ErrorState message="Could not load project reports." />
			</div>
		);
	}

	const items = reports?.bugs ?? [];
	if (items.length === 0) {
		return (
			<div className="space-y-4">
				{intro}
				<EmptyState
					action={
						<ProjectReportButton
							collapsed={false}
							defaultProjectId={projectId}
							label="File report"
						/>
					}>
					No reports filed for this project.
				</EmptyState>
			</div>
		);
	}
	const ordered = sortReports(items, sort);
	const visible = ordered.filter((report) => {
		if (kind !== 'all' && (report.kind === 'bug' ? 'remediation' : 'feature') !== kind) {
			return false;
		}
		const normalizedQuery = query.trim().toLowerCase();
		if (normalizedQuery === '') return true;
		const identifier = report.featureDirectory ?? report.featureId ?? report.id;
		return [
			report.description,
			identifier,
			report.classificationReason,
			report.metadata?.pathname,
		]
			.filter((value): value is string => Boolean(value))
			.some((value) => value.toLowerCase().includes(normalizedQuery));
	});
	const activePage = clampPage(page, visible.length, REPORTS_PAGE_SIZE);
	const pageReports = visible.slice(
		activePage * REPORTS_PAGE_SIZE,
		(activePage + 1) * REPORTS_PAGE_SIZE,
	);
	const selectFeature = (directory: string) => {
		setSelectedFeature(
			features.find((feature) => featureDirectory(feature) === directory) ?? null,
		);
	};
	const changeSort = (key: ReportSortKey) => {
		setSort((current) => ({
			direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
			key,
		}));
		setPage(0);
	};

	return (
		<div className={`space-y-4 ${tableColumnClass}`}>
			<div className="flex flex-wrap items-start justify-between gap-3">
				{intro}
				<div className="sm:hidden">
					<ProjectReportButton
						collapsed={false}
						defaultProjectId={projectId}
						label="File report"
						showLabelOnMobile
						variant="primary"
					/>
				</div>
			</div>
			<FilterToolbar
				actionRole="page"
				actions={
					<div className="hidden sm:block">
						<ProjectReportButton
							collapsed={false}
							defaultProjectId={projectId}
							label="File report"
							variant="primary"
						/>
					</div>
				}
				activeFilterCount={countActiveFilters(kind !== 'all')}
				columns="@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_1fr]"
				filtered={visible.length}
				hasFilters={query.trim() !== '' || kind !== 'all'}
				noun="reports"
				onReset={resetFilters}
				primaryControlCount={1}
				total={ordered.length}>
				<FilterSearch
					onChange={(value) => {
						setQuery(value);
						setPage(0);
					}}
					placeholder="Filter reports"
					value={query}
				/>
				<FilterSelect
					label="Kind"
					onChange={(value) => {
						setKind(value as ReportKindFilter);
						setPage(0);
					}}
					options={[
						{ label: 'All kinds', value: 'all' },
						{ label: 'Remediation', value: 'remediation' },
						{ label: 'Feature', value: 'feature' },
					]}
					value={kind}
				/>
			</FilterToolbar>
			{visible.length === 0 ? (
				<EmptyState filterReset="toolbar" filters={emptyFilters}>
					No reports match the current filters.
				</EmptyState>
			) : (
				<>
					<ReportsDesktopTable
						features={features}
						footer={
							<Pagination
								onChange={setPage}
								page={activePage}
								pageSize={REPORTS_PAGE_SIZE}
								total={visible.length}
							/>
						}
						onSelectFeature={selectFeature}
						onSort={changeSort}
						reports={pageReports}
						sort={sort}
					/>
					<ReportsMobileList onSelectFeature={selectFeature} reports={pageReports} />
					<Card className="overflow-hidden p-0 xl:hidden">
						<Pagination
							onChange={setPage}
							page={activePage}
							pageSize={REPORTS_PAGE_SIZE}
							total={visible.length}
						/>
					</Card>
				</>
			)}
			{selectedFeature ? (
				<FeatureDetailsDialog
					feature={selectedFeature}
					features={features}
					onClose={() => setSelectedFeature(null)}
					projectId={projectId}
				/>
			) : null}
		</div>
	);
}
