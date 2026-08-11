import { useState } from 'react';
import { toast } from 'sonner';

import type { ProjectAssuranceProfile, ProjectAssuranceProfileInput } from '../../../api/types.ts';

import { ConfirmDialog } from '../../../components/shared/ConfirmDialog.tsx';
import { EditorActionBar } from '../../../components/shared/EditorActionBar.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.ts';
import { useProfilePreview } from '../../../hooks/useProfilePreview.ts';
import { useUpdateProjectProfile } from '../../../hooks/useProjects.ts';
import { useUnsavedGuard } from '../../../hooks/useUnsavedGuard.ts';
import { cn } from '../../../lib/cn.ts';
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
		<div className="space-y-4">
			{/* Above the form it commits, and sticky, rather than at the foot of the left column. On
			    a 2707px profile page the pair sat at y=2647 — below the fold at every viewport this
			    app is used at, so the only cue that six selects had unsaved edits was 60px of button
			    nobody had scrolled to. */}
			<EditorActionBar
				dirty={dirty}
				onDiscard={resetForm}
				onSave={saveProfile}
				pending={updateProfile.isPending}
				pendingLabel="Saving…"
				saveLabel="Save profile"
			/>
			<div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
				<div className="flex flex-col gap-4">
					<TabIntro
						description="The six facets that decide this project's assurance bucket, and with it which audits apply."
						title="Assurance profile"
					/>
					{/* items-start so each facet card sizes to its own option count: stretched to an
					    equal row height with top-aligned content, 'External integrations' (4 options)
					    left ~180px of void beside 'Data sensitivity' (5). */}
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
					{/* The same legend rank the six FacetCards use. As a small uppercase field label
					    it was the seventh group in one form wearing a different heading treatment
					    from the other six, directly below them. */}
					<Card>
						<label
							className="text-sm font-semibold text-foreground"
							htmlFor="profile-notes">
							Notes
						</label>
						<p className="mt-0.5 mb-3 text-xs text-muted-foreground">
							Why this profile was chosen, for whoever reviews the posture next.
						</p>
						{/* `cn`, not a template string: `textareaClass` carries `min-h-28` and a
						    concatenated `min-h-24` is smaller, so both landed on the element and
						    Tailwind's cascade order handed it to the shared floor. This is the same
						    defect the Director page's Cycle Directive field had — the two are the only
						    call sites whose override is *below* the shared minimum, which is why every
						    other `${textareaClass} min-h-*` site happens to work. */}
						<textarea
							className={cn(textareaClass, 'min-h-24')}
							id="profile-notes"
							maxLength={4000}
							onChange={(event) => updateNotes(event.target.value)}
							placeholder="Optional context for why this profile was chosen."
							value={form.notes ?? ''}
						/>
					</Card>
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
