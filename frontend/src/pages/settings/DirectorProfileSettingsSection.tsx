/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { DirectorProfileInput } from '../../api/types.ts';

import { useDirector } from '../../hooks/useDirector.ts';
import { DirectorProfileSection } from '../director/DirectorProfileSection.tsx';
import { profileInput } from '../director/directorUtils.ts';

/**
 * Director profile editor. Its own data model (`PUT /director/profile`), so it
 * keeps a self-contained form + Save, unaffected by the page-level settings
 * save. Lives in AI & Director alongside the provider and Direct AI config that
 * determines which backend the director uses.
 */
export function DirectorProfileSettingsSection() {
	const director = useDirector();
	const [profileForm, setProfileForm] = useState<DirectorProfileInput>({});

	useEffect(() => {
		const profile = director.profile.data;
		if (!profile) return;
		setProfileForm({
			backend: profile.backend,
			instructions: profile.instructions,
			model: profile.model,
			reasoningEffort: profile.reasoningEffort,
			role: profile.role,
		});
	}, [director.profile.data]);

	function saveProfile(): void {
		director.updateProfile.mutate(profileInput(profileForm), {
			onError(error) {
				toast.error(
					error instanceof Error ? error.message : 'Director profile save failed'
				);
			},
			onSuccess() {
				toast.success('Director profile saved');
			},
		});
	}

	return (
		<DirectorProfileSection
			form={profileForm}
			onChange={setProfileForm}
			onSave={saveProfile}
			pending={director.updateProfile.isPending}
		/>
	);
}
