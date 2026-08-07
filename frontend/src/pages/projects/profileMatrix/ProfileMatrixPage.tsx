import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import type { ProfileMatrixFilterState } from './profileMatrixFilters.ts';
import type { ProfileMatrixSortDir, ProfileMatrixSortKey } from './profileMatrixTypes.ts';

import { DataFreshness } from '../../../components/shared/DataFreshness.tsx';
import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { Button, buttonClassName } from '../../../components/ui/button.tsx';
import {
	SegmentedControl,
	type SegmentedControlOption,
} from '../../../components/ui/segmented-control.tsx';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle.ts';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { emptyMatrixFilters, filterMatrixRows } from './profileMatrixFilters.ts';
import { ProfileMatrixMobileList } from './ProfileMatrixMobileList.tsx';
import { compareProfileMatrixRows } from './profileMatrixSorting.ts';
import { ProfileMatrixTable } from './ProfileMatrixTable.tsx';
import { ProfileMatrixToolbar } from './ProfileMatrixToolbar.tsx';
import { useProfileMatrixForms } from './useProfileMatrixForms.ts';

type MatrixMode = 'edit' | 'summary';

const modeOptions: readonly SegmentedControlOption<MatrixMode>[] = [
	{ label: 'Summary', title: 'Posture and audit outcomes only', value: 'summary' },
	{ label: 'Edit facets', title: 'Show the six profile facets for bulk editing', value: 'edit' },
];

export function ProfileMatrixPage() {
	useDocumentTitle('Profile Matrix');
	const {
		dirtyRows,
		isSavingAny,
		previews,
		projectList,
		projects,
		resetRow,
		rowsWithPreviews,
		saveAll,
		saveRow,
		updateFacet,
	} = useProfileMatrixForms();
	// The six facet selects are what make this table wider than any screen, so the summary is the
	// resting state and editing is a mode the operator asks for.
	const [mode, setMode] = useState<MatrixMode>('summary');
	const [filters, setFilters] = useState<ProfileMatrixFilterState>(emptyMatrixFilters);
	const [sortDir, setSortDir] = useState<ProfileMatrixSortDir>('asc');
	const [sortKey, setSortKey] = useState<ProfileMatrixSortKey>('project');

	const sortedRows = useMemo(
		() =>
			filterMatrixRows(
				[...rowsWithPreviews].sort((a, b) =>
					compareProfileMatrixRows(a, b, sortKey, sortDir),
				),
				filters,
			),
		[filters, rowsWithPreviews, sortDir, sortKey],
	);

	async function refreshProjects(): Promise<void> {
		await projects.refetch();
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
		<div className="page-reveal space-y-5">
			<PageHeader
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<SegmentedControl
							ariaLabel="Profile matrix columns"
							onChange={setMode}
							options={modeOptions}
							value={mode}
						/>
						<DataFreshness
							label="Profile matrix"
							onRefresh={() => {
								void refreshProjects();
							}}
							queries={[projects, previews]}
						/>
						<Link className={buttonClassName('secondary')} to="/projects">
							Projects
						</Link>
						<Button
							disabled={dirtyRows.length === 0 || isSavingAny}
							onClick={() => {
								void saveAll();
							}}
							variant="primary">
							{isSavingAny ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Save className="h-4 w-4" />
							)}
							Save all changed
						</Button>
					</div>
				}
				breadcrumb={
					<Link className={`hover:underline ${touchTargetTextClass}`} to="/projects">
						Projects
					</Link>
				}
				description={
					<>
						{projectList.length} discovered projects ·{' '}
						{dirtyRows.length > 0 ? (
							<button
								className={`underline underline-offset-2 hover:text-foreground ${touchTargetTextClass}`}
								onClick={revealFirstDirtyRow}
								type="button">
								{dirtyRows.length} unsaved profile edits
							</button>
						) : (
							'no unsaved profile edits'
						)}
					</>
				}
				helpSlug="projects"
				title="Profile Matrix"
			/>

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

			<ProfileMatrixToolbar
				filters={filters}
				onChange={setFilters}
				shownCount={sortedRows.length}
				totalCount={rowsWithPreviews.length}
			/>

			<ProfileMatrixMobileList
				onChange={updateFacet}
				onReset={resetRow}
				onSave={(projectId) => {
					void saveRow(projectId);
				}}
				rows={sortedRows}
				showFacets={mode === 'edit'}
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
	);
}
