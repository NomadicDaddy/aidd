import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useState } from 'react';

import type { ProfileMatrixFilterState } from './profileMatrixFilters.ts';
import type { ProfileMatrixSortDir, ProfileMatrixSortKey } from './profileMatrixTypes.ts';

import { DataFreshness } from '../../../components/shared/DataFreshness.tsx';
import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { SkeletonRows } from '../../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { PageRail } from '../../../components/shared/PageRail.tsx';
import { Button } from '../../../components/ui/button.tsx';
import {
	SegmentedControl,
	type SegmentedControlOption,
} from '../../../components/ui/segmented-control.tsx';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle.ts';
import { pageRailByContentType } from '../../../lib/contentRails.ts';
import { toneText } from '../../../lib/tones.ts';
import { profileFacets } from '../detail/profile/profile-facets.ts';
import {
	emptyMatrixFilters,
	filterMatrixRows,
	profileMatrixFilterRegister,
} from './profileMatrixFilters.ts';
import { unsavedProfileEditLabel } from './profileMatrixLabels.ts';
import { ProfileMatrixMobileList } from './ProfileMatrixMobileList.tsx';
import { compareProfileMatrixRows } from './profileMatrixSorting.ts';
import { ProfileMatrixTable } from './ProfileMatrixTable.tsx';
import { ProfileMatrixToolbar } from './ProfileMatrixToolbar.tsx';
import { useProfileMatrixForms } from './useProfileMatrixForms.ts';

type MatrixMode = 'edit' | 'summary';

const PAGE_RAIL = pageRailByContentType.data;

const modeOptions: readonly SegmentedControlOption<MatrixMode>[] = [
	{ label: 'Summary', title: 'Posture and audit outcomes only', value: 'summary' },
	{
		label: 'Edit facets',
		title: `Choose among all ${profileFacets.length} profile facets for editing`,
		value: 'edit',
	},
];

export function ProfileMatrixPage() {
	useDocumentTitle('Profile Matrix');
	const {
		dirtyRows,
		isSavingAny,
		previews,
		projects,
		resetRow,
		rowsWithPreviews,
		saveAll,
		saveRow,
		updateFacet,
	} = useProfileMatrixForms();
	// The editable facet columns make this table wider than its summary, so editing remains a mode
	// the operator asks for rather than the resting state.
	const [mode, setMode] = useState<MatrixMode>('summary');
	const [filters, setFilters] = useState<ProfileMatrixFilterState>(emptyMatrixFilters);
	const [sortDir, setSortDir] = useState<ProfileMatrixSortDir>('asc');
	const [sortKey, setSortKey] = useState<ProfileMatrixSortKey>('project');

	const sortedRows = filterMatrixRows(
		[...rowsWithPreviews].sort((a, b) => compareProfileMatrixRows(a, b, sortKey, sortDir)),
		filters,
	);
	function resetFilters(): void {
		setFilters(emptyMatrixFilters);
	}
	const emptyFilters = profileMatrixFilterRegister(filters, resetFilters);

	async function refreshProjects(): Promise<void> {
		await projects.refetch();
	}
	async function refreshMatrix(): Promise<boolean> {
		const results = await Promise.allSettled([
			projects.refetch({ throwOnError: true }),
			previews.refetch({ throwOnError: true }),
		]);
		return results.every((result) => result.status === 'fulfilled');
	}

	function toggleSort(nextKey: ProfileMatrixSortKey): void {
		if (nextKey === sortKey) {
			setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
		} else {
			setSortKey(nextKey);
			setSortDir('asc');
		}
	}

	function revealFirstDirtyRow(): void {
		document
			.querySelector('[data-dirty="true"]')
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	return (
		<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				actions={
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<SegmentedControl
							ariaLabel="Profile matrix columns"
							onChange={setMode}
							options={modeOptions}
							value={mode}
						/>
						<DataFreshness
							label="Profile matrix"
							onRefresh={refreshMatrix}
							sources={[
								{ label: 'Project profiles', query: projects },
								{ label: 'Audit previews', query: previews },
							]}
						/>
						{dirtyRows.length > 0 ? (
							<span
								className={`text-xs font-medium whitespace-nowrap tabular-nums ${toneText.amber}`}>
								{unsavedProfileEditLabel(dirtyRows.length)}
							</span>
						) : null}
						{dirtyRows.length > 0 ? (
							<>
								<Button
									onClick={revealFirstDirtyRow}
									size="compact"
									variant="ghost">
									Jump to first edit
								</Button>
								<Button
									disabled={isSavingAny}
									onClick={() => {
										void saveAll();
									}}
									size="compact"
									variant="primary">
									{isSavingAny ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Save className="h-4 w-4" />
									)}
									Save all changed
								</Button>
							</>
						) : null}
					</div>
				}
				breadcrumb={{ label: 'Projects', to: '/projects' }}
				description="Compare assurance posture and audit applicability across the fleet."
				helpSlug="profile-matrix"
				title="Profile Matrix"
			/>

			{projects.isError || previews.isError ? (
				<div className="space-y-3">
					{projects.isError ? (
						<ErrorState
							error={projects.error}
							message="Unknown error fetching project list."
							onRetry={() => {
								void refreshProjects();
							}}
							title="Could not load project profiles."
						/>
					) : null}
					{previews.isError ? (
						<ErrorState
							error={previews.error}
							message="Profile audit applicability could not be recomputed."
							onRetry={() => {
								void previews.refetch();
							}}
							title="Could not preview profile changes."
						/>
					) : null}
				</div>
			) : null}

			<div className={mode === 'summary' ? 'max-w-[80rem] space-y-5' : 'space-y-5'}>
				<ProfileMatrixToolbar
					filters={filters}
					onChange={setFilters}
					onReset={resetFilters}
					shownCount={sortedRows.length}
					totalCount={rowsWithPreviews.length}
				/>

				{projects.isError && rowsWithPreviews.length === 0 ? null : projects.isLoading &&
				  rowsWithPreviews.length === 0 ? (
					<SkeletonRows columns={5} count={6} label="Loading project profiles…" />
				) : rowsWithPreviews.length === 0 ? (
					<EmptyState>No projects are available for profile comparison.</EmptyState>
				) : sortedRows.length === 0 ? (
					<EmptyState filterReset="toolbar" filters={emptyFilters}>
						No projects match the current filters.
					</EmptyState>
				) : (
					<div>
						<ProfileMatrixMobileList
							onChange={updateFacet}
							onReset={resetRow}
							onSave={(projectId) => {
								void saveRow(projectId);
							}}
							onSort={toggleSort}
							rows={sortedRows}
							showFacets={mode === 'edit'}
							sortDir={sortDir}
							sortKey={sortKey}
						/>

						<ProfileMatrixTable
							activeSortDir={sortDir}
							activeSortKey={sortKey}
							isPreviewing={previews.isFetching}
							onChange={updateFacet}
							onReset={resetRow}
							onSave={(projectId) => {
								void saveRow(projectId);
							}}
							onSort={toggleSort}
							rows={sortedRows}
							showFacets={mode === 'edit'}
						/>
					</div>
				)}
			</div>
		</PageRail>
	);
}
