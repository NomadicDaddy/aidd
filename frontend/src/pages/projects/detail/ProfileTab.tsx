import { useState } from 'react';
import { toast } from 'sonner';

import type { ProjectAssuranceProfile, ProjectAssuranceProfileInput } from '../../../api/types.ts';

import { Card } from '../../../components/ui/card.tsx';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.ts';
import { useProfilePreview } from '../../../hooks/useProfilePreview.ts';
import { useUpdateProjectProfile } from '../../../hooks/useProjects.ts';
import { profileInput, sameProfileInput } from '../profile/profile-helpers.ts';
import { ComputedProfilePanel } from './profile/ComputedProfilePanel.tsx';
import { FacetCard } from './profile/FacetCard.tsx';
import { type FacetField, profileFacets } from './profile/profile-facets.ts';

export function ProfileTab({
	profile,
	projectId,
}: {
	profile: ProjectAssuranceProfile;
	projectId: string;
}) {
	const savedInput = profileInput(profile);

	// Reseed the editable form from the saved profile whenever the project or the persisted profile
	// changes (updatedAt advances on every write), using React's "adjust state during render" pattern
	// so a background detail refetch never clobbers in-flight edits.
	const signature = `${projectId}:${profile.updatedAt}`;
	const [form, setForm] = useState<ProjectAssuranceProfileInput>(savedInput);
	const [seededFor, setSeededFor] = useState(signature);
	if (signature !== seededFor) {
		setSeededFor(signature);
		setForm(savedInput);
	}

	const debounced = useDebouncedValue(form, 300);
	const preview = useProfilePreview(projectId, debounced);
	const updateProfile = useUpdateProjectProfile(projectId);
	const dirty = !sameProfileInput(form, savedInput);

	function updateField(field: FacetField, value: string): void {
		setForm((current) => ({ ...current, [field]: value }));
	}

	function updateNotes(notes: string): void {
		setForm((current) => ({ ...current, notes }));
	}

	function resetForm(): void {
		setForm(savedInput);
	}

	function saveProfile(): void {
		updateProfile.mutate(form, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Profile save failed');
			},
			onSuccess() {
				toast.success('Project profile saved');
			},
		});
	}

	return (
		<div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
			<div className="flex flex-col gap-4">
				<div className="grid gap-4 md:grid-cols-2">
					{profileFacets.map((facet) => (
						<FacetCard
							facet={facet}
							key={facet.field}
							onChange={updateField}
							value={form[facet.field]}
						/>
					))}
				</div>
				<Card>
					<label className="grid gap-1">
						<span className="text-xs font-medium text-muted-foreground uppercase">
							Notes
						</span>
						<textarea
							aria-label="Project profile notes"
							className="min-h-24 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none"
							maxLength={4000}
							onChange={(event) => updateNotes(event.target.value)}
							placeholder="Optional context for why this profile was chosen."
							value={form.notes ?? ''}
						/>
					</label>
				</Card>
			</div>

			<ComputedProfilePanel
				dirty={dirty}
				form={form}
				isPreviewError={preview.isError}
				isPreviewing={preview.isFetching}
				isSaving={updateProfile.isPending}
				onReset={resetForm}
				onSave={saveProfile}
				preview={preview.data}
				source={profile.source}
			/>
		</div>
	);
}
