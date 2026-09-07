import { useState } from 'react';

type InterviewDraftMap = Readonly<Record<string, Readonly<Record<string, string>>>>;

const EMPTY_DRAFTS: Readonly<Record<string, string>> = {};

export function draftsForProject(
	draftsByProject: InterviewDraftMap,
	projectId: string,
): Readonly<Record<string, string>> {
	return draftsByProject[projectId] ?? EMPTY_DRAFTS;
}

export function storeInterviewDraft(
	draftsByProject: InterviewDraftMap,
	projectId: string,
	questionId: string,
	value: string,
): InterviewDraftMap {
	return {
		...draftsByProject,
		[projectId]: {
			...draftsForProject(draftsByProject, projectId),
			[questionId]: value,
		},
	};
}

export function clearInterviewDraft(
	draftsByProject: InterviewDraftMap,
	projectId: string,
	questionId: string,
): InterviewDraftMap {
	const projectDrafts = draftsForProject(draftsByProject, projectId);
	if (!(questionId in projectDrafts)) return draftsByProject;
	const nextProjectDrafts = { ...projectDrafts };
	delete nextProjectDrafts[questionId];
	return { ...draftsByProject, [projectId]: nextProjectDrafts };
}

/**
 * Interview panels are intentionally unmounted with the other inactive project-detail tabs. Keep
 * their unsaved text one level above that lifecycle boundary and key it by project so route changes
 * cannot expose one project's draft in another project.
 */
export function useInterviewDrafts(projectId: string | undefined) {
	const [draftsByProject, setDraftsByProject] = useState<InterviewDraftMap>({});
	function clearDraft(questionId: string): void {
		if (projectId === undefined) return;
		setDraftsByProject((current) => clearInterviewDraft(current, projectId, questionId));
	}
	function updateDraft(questionId: string, value: string): void {
		if (projectId === undefined) return;
		setDraftsByProject((current) => storeInterviewDraft(current, projectId, questionId, value));
	}
	return {
		clearDraft,
		drafts:
			projectId === undefined ? EMPTY_DRAFTS : draftsForProject(draftsByProject, projectId),
		updateDraft,
	};
}
