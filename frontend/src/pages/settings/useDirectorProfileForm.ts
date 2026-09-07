import { useState } from 'react';
import { toast } from 'sonner';

import type { DirectorProfile, DirectorProfileInput } from '../../api/types.ts';

import { useDirector } from '../../hooks/useDirector.ts';
import { profileInput } from '../director/directorUtils.ts';

export interface DirectorProfileForm {
	/** Whether what is on screen would send anything different from what the server holds. */
	dirty: boolean;
	discard: () => void;
	form: DirectorProfileInput;
	pending: boolean;
	save: () => void;
	setForm: (updater: (current: DirectorProfileInput) => DirectorProfileInput) => void;
}

function savedForm(profile: DirectorProfile | undefined): DirectorProfileInput {
	if (!profile) return {};
	return {
		backend: profile.backend,
		instructions: profile.instructions,
		model: profile.model,
		reasoningEffort: profile.reasoningEffort,
		role: profile.role,
	};
}

/**
 * The Director Profile's form, owned above the tab panel that renders it.
 *
 * The section component is a child of a `TabPanel` — and a `TabPanel` unmounts when you leave it.
 * State inside the section would make the card a save island with no unsaved vocabulary of any
 * kind: Save Profile identical dirty or clean, the AI & Director tab trigger carrying no dot, and a
 * tab switch silently discarding the edit that the absent dot had just failed to mention. The state
 * has to outlive the panel for the dot to be true, which is why it is a hook called by the page
 * rather than `useState` in the section.
 *
 * `null` means untouched, so what renders follows the server record until someone types — no effect
 * copying data into state, and no window where a freshly loaded profile reads as an edit.
 */
export function useDirectorProfileForm(): DirectorProfileForm {
	const director = useDirector();
	const [edited, setEdited] = useState<DirectorProfileInput | null>(null);
	const saved = savedForm(director.profile.data);

	// Compared after `profileInput` on both sides — that is what Save would actually send, so
	// trailing whitespace in Behavior, or a Role retyped to the same value, is not a change. It is
	// also what makes item 5 fall out for free: revert the edit and the flag clears itself.
	const dirty =
		edited !== null &&
		JSON.stringify(profileInput(edited)) !== JSON.stringify(profileInput(saved));

	return {
		dirty,
		discard(): void {
			setEdited(null);
		},
		form: edited ?? saved,
		pending: director.updateProfile.isPending,
		save(): void {
			director.updateProfile.mutate(profileInput(edited ?? saved), {
				onError(error) {
					toast.error(
						error instanceof Error ? error.message : 'Director profile save failed',
					);
				},
				onSuccess() {
					// Back to following the record: the saved profile is now what is on screen, and
					// leaving the edit in place would keep the dot lit against its own result.
					setEdited(null);
					toast.success('Director profile saved');
				},
			});
		},
		setForm(updater): void {
			setEdited((current) => updater(current ?? saved));
		},
	};
}
