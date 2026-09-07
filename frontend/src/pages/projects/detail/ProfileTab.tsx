import { useState } from 'react';
import { toast } from 'sonner';

import type { ProjectAssuranceProfile, ProjectAssuranceProfileInput } from '../../../api/types.ts';

import { ConfirmDialog } from '../../../components/shared/ConfirmDialog.tsx';
import { EditorActionBar } from '../../../components/shared/EditorActionBar.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.ts';
import { useProfilePreview } from '../../../hooks/useProfilePreview.ts';
import { useUpdateProjectProfile } from '../../../hooks/useProjects.ts';
import { useUnsavedGuard } from '../../../hooks/useUnsavedGuard.ts';
import { textareaClass } from '../../../lib/formStyles.ts';
import { tableColumnClass } from '../../../lib/tableStyles.ts';
import { proseMeasureCardClass } from '../../../lib/typography.ts';
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
	const savedPreview = useProfilePreview(projectId, savedInput);
	const updateProfile = useUpdateProjectProfile(projectId);
	const dirty = !sameProfileInput(form, savedInput);
	// Settings has guarded its form this way since it grew one; this one had six facet selects and a
	// notes field that a stray click on any sibling tab silently discarded.
	const blocker = useUnsavedGuard(dirty && !updateProfile.isPending);

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
		<div className={`@container/profile space-y-4 ${tableColumnClass}`}>
			<TabIntro
				description="The profile facets that decide this project's assurance bucket, and with it which audits apply."
				title="Profile"
			/>
			<div className="grid gap-6 @min-[68rem]/profile:grid-cols-[1.5fr_1fr]">
				<div className="@container/editor flex flex-col gap-4">
					{/* Above the form it commits, and sticky, rather than at the foot of the editor.
					    Keeping the bar inside this column also leaves the sticky computed-posture rail
					    visible beside it instead of painting a full-width strip over the rail's header. */}
					<EditorActionBar
						dirty={dirty}
						onDiscard={resetForm}
						onSave={saveProfile}
						pending={updateProfile.isPending}
						pendingLabel="Saving…"
						saveLabel="Save profile"
					/>
					<div className="@min-[68rem]/profile:hidden">
						<ComputedProfilePanel
							dirty={dirty}
							form={form}
							isPreviewError={preview.isError}
							isPreviewing={preview.isFetching}
							mode="summary"
							preview={preview.data}
							savedPreview={savedPreview.data}
						/>
					</div>
					{/* Facets are independent settings, so columns may pack each card directly after
					    the previous one instead of locking both columns to the taller card in a grid row. */}
					<div className="columns-1 gap-4 @min-[40rem]/editor:columns-2">
						{profileFacets.map((facet) => (
							<div className="mb-4 break-inside-avoid" key={facet.field}>
								<FacetCard
									facet={facet}
									onChange={updateField}
									value={form[facet.field]}
								/>
							</div>
						))}
					</div>
					{/* The same header the six FacetCards use, for the same reason: as a hand-styled
					    label it was the seventh group in one form wearing a different heading
					    treatment from the other six, directly below them, and it was not in the
					    heading tree at all. The visible title is the `CardHeader` h3; the `label`
					    the textarea needs stays, visually hidden. */}
					<Card className={proseMeasureCardClass}>
						<CardHeader
							className="mb-3"
							description="Why this profile was chosen, for whoever reviews the posture next."
							headingLevel={3}
							title="Notes"
						/>
						<label className="sr-only" htmlFor="profile-notes">
							Notes
						</label>
						<textarea
							className={`${textareaClass} min-h-40`}
							id="profile-notes"
							maxLength={4000}
							onChange={(event) => updateNotes(event.target.value)}
							placeholder="Optional context for why this profile was chosen."
							value={form.notes ?? ''}
						/>
					</Card>
					<div className="@min-[68rem]/profile:hidden">
						<ComputedProfilePanel
							dirty={dirty}
							form={form}
							isPreviewError={preview.isError}
							isPreviewing={preview.isFetching}
							mode="audits"
							preview={preview.data}
							savedPreview={savedPreview.data}
						/>
					</div>
				</div>

				<div className="hidden @min-[68rem]/profile:block">
					<ComputedProfilePanel
						dirty={dirty}
						form={form}
						isPreviewError={preview.isError}
						isPreviewing={preview.isFetching}
						preview={preview.data}
						savedPreview={savedPreview.data}
					/>
				</div>
			</div>
			<ConfirmDialog
				confirmLabel="Discard changes"
				description="You have unsaved profile changes. Leaving this page will discard them."
				destructive
				onClose={() => blocker.reset?.()}
				onConfirm={() => blocker.proceed?.()}
				open={blocker.state === 'blocked'}
				title="Discard unsaved changes?"
			/>
		</div>
	);
}
