import type { ProjectAssuranceProfile, ProjectAssuranceProfileInput } from './types.ts';

import { apiSend } from './client.ts';
import { projectApiPath } from './projectPath.ts';

export async function updateProjectProfile(
	id: string,
	body: ProjectAssuranceProfileInput,
): Promise<ProjectAssuranceProfile> {
	const response = await apiSend<{ profile: ProjectAssuranceProfile }>(
		`${projectApiPath(id)}/profile`,
		'PUT',
		body,
	);
	return response.profile;
}

/** One audit's resolved applicability under a candidate profile. */
export interface ProfilePreviewAudit {
	applies: boolean;
	effect: 'default' | 'disabled' | 'excluded' | 'required';
	name: string;
}

/** Live (unsaved) recomputation of a profile's posture + audit applicability. */
export interface ProfilePreview {
	audits: ProfilePreviewAudit[];
	isLowExposureLocal: boolean;
	requiresFullHardening: boolean;
}

export interface ProjectProfilePreviewRequest {
	profile: ProjectAssuranceProfileInput;
	projectId: string;
}

export type ProjectProfilePreviews = Record<string, ProfilePreview>;

export async function previewProjectProfile(
	id: string,
	body: ProjectAssuranceProfileInput,
): Promise<ProfilePreview> {
	const response = await apiSend<{ preview: ProfilePreview }>(
		`${projectApiPath(id)}/profile/preview`,
		'POST',
		body,
	);
	return response.preview;
}

export async function previewProjectProfiles(
	profiles: ProjectProfilePreviewRequest[],
): Promise<ProjectProfilePreviews> {
	const response = await apiSend<{ previews: ProjectProfilePreviews }>(
		'/api/v1/projects/profile-previews',
		'POST',
		{ profiles },
	);
	return response.previews;
}
