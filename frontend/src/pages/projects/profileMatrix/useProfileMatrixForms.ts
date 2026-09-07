import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type { ProfileMatrixRowModel } from './profileMatrixTypes.ts';

import { updateProjectProfile } from '../../../api/projects.ts';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.ts';
import { useProfilePreviews } from '../../../hooks/useProfilePreview.ts';
import { useProjects } from '../../../hooks/useProjects.ts';
import { invalidateProjectQueries } from '../../../hooks/useProjectsShared.ts';
import { getProfilePosture, profileInput, sameProfileInput } from '../profile/profile-helpers.ts';

function formSignature(form: ProjectAssuranceProfileInput): string {
	return [
		form.authMode,
		form.bucket,
		form.criticality,
		form.dataSensitivity,
		form.deployment,
		form.derivesFromTemplate,
		form.externalIntegrations,
		form.hasCliBinary,
		form.publishesReleaseArchives,
		form.shipsContainerImage,
		form.notes ?? '',
	].join('|');
}

/**
 * Every project's in-flight profile edit, plus the audit-applicability preview each edit implies.
 * Kept out of `ProfileMatrixPage` so that file stays presentation: the page decides what to render,
 * this decides what a row currently is and what saving one means.
 */
export function useProfileMatrixForms() {
	const queryClient = useQueryClient();
	const projects = useProjects();
	const [forms, setForms] = useState<Record<string, ProjectAssuranceProfileInput>>({});
	const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set());
	const savedFormsRef = useRef(new Map<string, ProjectAssuranceProfileInput>());
	const signaturesRef = useRef(new Map<string, string>());
	const projectRecords = projects.data?.projects;

	const projectList = [...(projectRecords ?? [])].sort((a, b) => a.name.localeCompare(b.name));

	// Refetched projects have to drop the local copy of any row whose saved profile changed, and
	// only an effect sees that arrive.
	useEffect(() => {
		setForms((current) => {
			const next = { ...current };
			const activeIds = new Set((projectRecords ?? []).map((project) => project.id));
			for (const project of projectRecords ?? []) {
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
	}, [projectRecords]);

	const rows: ProfileMatrixRowModel[] = projectList.map((project) => {
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
	});

	const previewRequests = rows.map((row) => ({
		profile: row.form,
		projectId: row.project.id,
	}));
	const previewRequestKey = previewRequests
		.map((request) => `${request.projectId}:${formSignature(request.profile)}`)
		.join('\n');
	const previews = useProfilePreviews(useDebouncedValue(previewRequests, 300, previewRequestKey));
	const rowsWithPreviews: ProfileMatrixRowModel[] = rows.map((row) => ({
		...row,
		preview: previews.data?.[row.project.id],
	}));
	const dirtyRows = rowsWithPreviews.filter((row) => row.dirty);

	function updateFacet(
		projectId: string,
		field: FacetField,
		value: ProjectAssuranceProfileInput[FacetField],
	): void {
		const row = rowsWithPreviews.find((candidate) => candidate.project.id === projectId);
		if (!row) return;
		setForms((current) => ({ ...current, [projectId]: { ...row.form, [field]: value } }));
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

	return {
		dirtyRows,
		isSavingAny: savingIds.size > 0,
		previews,
		projectList,
		projects,
		resetRow,
		rowsWithPreviews,
		saveAll,
		saveRow,
		updateFacet,
	};
}
