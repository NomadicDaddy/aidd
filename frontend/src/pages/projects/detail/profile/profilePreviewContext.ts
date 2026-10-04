import { createContext, use } from 'react';

import type { ProfilePreview } from '../../../../api/projects.ts';
import type { ProjectAssuranceProfileInput } from '../../../../api/types.ts';

/**
 * What every part of the computed profile reads: the form being edited, whether it differs from
 * the saved profile, and the two applicability previews. Provided once by ProfileTab.
 *
 * The panel used to take these six as props on each of its three mounts, plus a `mode` naming
 * which of three presentations to draw, decided by six conditionals inside it. The parts are now
 * separate components, so a call site says what it shows instead of encoding it in a string.
 */
export interface ProfilePreviewState {
	dirty: boolean;
	form: ProjectAssuranceProfileInput;
	isPreviewError: boolean;
	isPreviewing: boolean;
	preview: ProfilePreview | undefined;
	savedPreview: ProfilePreview | undefined;
}

export const ProfilePreviewContext = createContext<null | ProfilePreviewState>(null);

/** The computed-profile state ProfileTab provides. */
export function useProfilePreviewState(): ProfilePreviewState {
	const value = use(ProfilePreviewContext);
	if (value === null)
		throw new Error('Computed profile parts must render inside ProfilePreviewContext.');
	return value;
}
