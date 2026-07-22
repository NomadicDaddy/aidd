import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ProjectAssuranceProfileInput } from '../api/types.ts';

import {
	previewProjectProfile,
	previewProjectProfiles,
	type ProjectProfilePreviewRequest,
} from '../api/projects.ts';
import { retryUnlessClientError } from '../api/retry.ts';

/**
 * Live recomputation of a candidate (unsaved) profile's posture + audit applicability.
 *
 * The caller is expected to pass an already-debounced `form` so rapid facet edits coalesce
 * into one request. `keepPreviousData` holds the last result visible while the next recompute
 * is in flight, so the computed panel updates smoothly instead of flashing empty.
 */
export function useProfilePreview(id: string | undefined, form: ProjectAssuranceProfileInput) {
	return useQuery({
		enabled: Boolean(id),
		placeholderData: keepPreviousData,
		queryFn: () => previewProjectProfile(id ?? '', form),
		queryKey: ['project-profile-preview', id, form],
		retry: retryUnlessClientError,
		staleTime: 60_000,
	});
}

export function useProfilePreviews(profiles: ProjectProfilePreviewRequest[]) {
	return useQuery({
		enabled: profiles.length > 0,
		placeholderData: keepPreviousData,
		queryFn: () => previewProjectProfiles(profiles),
		queryKey: ['project-profile-previews', profiles],
		retry: retryUnlessClientError,
		staleTime: 60_000,
	});
}
