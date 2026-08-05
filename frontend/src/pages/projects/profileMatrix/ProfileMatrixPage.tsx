import { useQueryClient } from '@tanstack/react-query';
import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type {
	ProfileMatrixRowModel,
	ProfileMatrixSortDir,
	ProfileMatrixSortKey,
} from './profileMatrixTypes.ts';

import { updateProjectProfile } from '../../../api/projects.ts';
import { DataFreshness } from '../../../components/shared/DataFreshness.tsx';
import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { Button, buttonClassName } from '../../../components/ui/button.tsx';
import {
	SegmentedControl,
	type SegmentedControlOption,
} from '../../../components/ui/segmented-control.tsx';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.ts';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle.ts';
import { useProfilePreviews } from '../../../hooks/useProfilePreview.ts';
import { useProjects } from '../../../hooks/useProjects.ts';
import { invalidateProjectQueries } from '../../../hooks/useProjectsShared.ts';
import { getProfilePosture, profileInput, sameProfileInput } from '../profile/profile-helpers.ts';
import { compareProfileMatrixRows } from './profileMatrixSorting.ts';
import { ProfileMatrixTable } from './ProfileMatrixTable.tsx';

type MatrixMode = 'edit' | 'summary';

const modeOptions: readonly SegmentedControlOption<MatrixMode>[] = [
	{ label: 'Summary', title: 'Posture and audit outcomes only', value: 'summary' },
	{ label: 'Edit facets', title: 'Show the six profile facets for bulk editing', value: 'edit' },
];

function formSignature(form: ProjectAssuranceProfileInput): string {
	return [
		form.authMode,
		form.bucket,
		form.criticality,
		form.dataSensitivity,
		form.deployment,
		form.externalIntegrations,
		form.notes ?? '',
	].join('|');
}

export function ProfileMatrixPage() {
	useDocumentTitle('Profile Matrix');
	const queryClient = useQueryClient();
	const projects = useProjects();
	const [forms, setForms] = useState<Record<string, ProjectAssuranceProfileInput>>({});
	// The six facet selects are what make this table wider than any screen, so the summary is the
	// resting state and editing is a mode the operator asks for.
	const [mode, setMode] = useState<MatrixMode>('summary');
	const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set());
	const [sortDir, setSortDir] = useState<ProfileMatrixSortDir>('asc');
	const [sortKey, setSortKey] = useState<ProfileMatrixSortKey>('project');
	const savedFormsRef = useRef(new Map<string, ProjectAssuranceProfileInput>());
	const signaturesRef = useRef(new Map<string, string>());

	const projectList = useMemo(
		() => [...(projects.data?.projects ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
		[projects.data?.projects],
	);

	useEffect(() => {
		setForms((current) => {
			const next = { ...current };
			const activeIds = new Set(projectList.map((project) => project.id));
			for (const project of projectList) {
				const saved = profileInput(project.metadata.profile);
				const signature = `${project.metadata.profile.updatedAt}:${formSignature(saved)}`;
				const previousSignature = signaturesRef.current.get(project.id);
				const previousSaved = savedFormsRef.current.get(project.id);
				if (signature !== previousSignature) {
					const currentForm = current[project.id];
					if (
						currentForm === undefined ||
						previousSaved === undefined ||
						sameProfileInput(currentForm, previousSaved)
					) {
						delete next[project.id];
					}
					signaturesRef.current.set(project.id, signature);
					savedFormsRef.current.set(project.id, saved);
				}
			}
			for (const id of Object.keys(next)) {
				if (!activeIds.has(id)) delete next[id];
			}
			return next;
		});
	}, [projectList]);

	const rows = useMemo<ProfileMatrixRowModel[]>(
		() =>
			projectList.map((project) => {
				const saved = profileInput(project.metadata.profile);
				const form = forms[project.id] ?? saved;
				return {
					dirty: !sameProfileInput(form, saved),
					form,
					posture: getProfilePosture(form),
					preview: undefined,
					project,
					saved,
					saving: savingIds.has(project.id),
				};
			}),
		[forms, projectList, savingIds],
	);

	const previewRequests = useMemo(
		() => rows.map((row) => ({ profile: row.form, projectId: row.project.id })),
		[rows],
	);
	const debouncedPreviewRequests = useDebouncedValue(previewRequests, 300);
	const previews = useProfilePreviews(debouncedPreviewRequests);
	const rowsWithPreviews = useMemo<ProfileMatrixRowModel[]>(
		() =>
			rows.map((row) => ({
				...row,
				preview: previews.data?.[row.project.id],
			})),
		[previews.data, rows],
	);
	const sortedRows = useMemo(
		() =>
			[...rowsWithPreviews].sort((a, b) => compareProfileMatrixRows(a, b, sortKey, sortDir)),
		[rowsWithPreviews, sortDir, sortKey],
	);
	const dirtyRows = rowsWithPreviews.filter((row) => row.dirty);

	function updateFacet(
		projectId: string,
		field: FacetField,
		value: ProjectAssuranceProfileInput[FacetField],
	): void {
		const row = rowsWithPreviews.find((candidate) => candidate.project.id === projectId);
		if (!row) return;
		setForms((current) => ({
			...current,
			[projectId]: { ...row.form, [field]: value },
		}));
	}

	function resetRow(projectId: string): void {
		setForms((current) => {
			const next = { ...current };
			delete next[projectId];
			return next;
		});
	}

	async function saveRow(projectId: string, quiet = false): Promise<boolean> {
		const row = rowsWithPreviews.find((candidate) => candidate.project.id === projectId);
		if (!row || !row.dirty || row.saving) return true;
		setSavingIds((current) => new Set(current).add(projectId));
		try {
			await updateProjectProfile(projectId, row.form);
			invalidateProjectQueries(queryClient);
			if (!quiet) toast.success(`${row.project.name} profile saved`);
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Profile save failed');
			return false;
		} finally {
			setSavingIds((current) => {
				const next = new Set(current);
				next.delete(projectId);
				return next;
			});
		}
	}

	async function saveAll(): Promise<void> {
		const results = await Promise.all(dirtyRows.map((row) => saveRow(row.project.id, true)));
		const saved = results.filter(Boolean).length;
		if (saved > 1) toast.success(`${saved} project profiles saved`);
	}

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

	const isSavingAny = savingIds.size > 0;

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
					<Link className="hover:underline" to="/projects">
						Projects
					</Link>
				}
				description={`${projectList.length} discovered projects · ${dirtyRows.length} unsaved profile edits`}
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
