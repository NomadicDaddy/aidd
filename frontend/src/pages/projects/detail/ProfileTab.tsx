import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ProjectAssuranceProfile, ProjectAssuranceProfileInput } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.ts';
import { useProfilePreview } from '../../../hooks/useProfilePreview.ts';
import { useUpdateProjectProfile } from '../../../hooks/useProjects.ts';
import { textareaClass } from '../../../lib/formStyles.ts';
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
				<Card>
					<CardHeader
						className="mb-0"
						description="The six facets that decide this project's assurance bucket, and with it which audits apply."
						title="Assurance profile"
					/>
				</Card>
				{/* items-start so each facet card sizes to its own option count: stretched to an
				    equal row height with top-aligned content, 'External integrations' (4 options) left
				    ~180px of void beside 'Data sensitivity' (5). */}
				<div className="grid items-start gap-4 xl:grid-cols-2">
					{profileFacets.map((facet) => (
						<FacetCard
							facet={facet}
							key={facet.field}
							onChange={updateField}
							value={form[facet.field]}
						/>
					))}
				</div>
				{/* The same legend rank the six FacetCards use. As a small uppercase field label it
				    was the seventh group in one form wearing a different heading treatment from the
				    other six, directly below them. */}
				<Card>
					<label
						className="text-sm font-semibold text-foreground"
						htmlFor="profile-notes">
						Notes
					</label>
					<p className="mt-0.5 mb-3 text-xs text-muted-foreground">
						Why this profile was chosen, for whoever reviews the posture next.
					</p>
					<textarea
						className={`${textareaClass} min-h-24`}
						id="profile-notes"
						maxLength={4000}
						onChange={(event) => updateNotes(event.target.value)}
						placeholder="Optional context for why this profile was chosen."
						value={form.notes ?? ''}
					/>
				</Card>
				{/* At the foot of the fields it writes. In the computed-posture rail the pair
				    landed level with the third facet — a Save button with three cards of unread
				    form below it — because that rail is two cards shorter than this column. */}
				<div className="flex items-center gap-2">
					<Button
						className="flex-1"
						disabled={!dirty || updateProfile.isPending}
						onClick={saveProfile}
						variant="primary">
						{updateProfile.isPending ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Save className="h-4 w-4" />
						)}
						Save profile
					</Button>
					<Button
						disabled={!dirty || updateProfile.isPending}
						onClick={resetForm}
						variant="secondary">
						<RotateCcw className="h-4 w-4" />
						Reset
					</Button>
				</div>
			</div>

			<ComputedProfilePanel
				dirty={dirty}
				form={form}
				isPreviewError={preview.isError}
				isPreviewing={preview.isFetching}
				preview={preview.data}
				source={profile.source}
			/>
		</div>
	);
}
