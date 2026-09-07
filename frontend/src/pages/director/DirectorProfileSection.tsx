import { normalizeBackendName } from 'aidd-shared/plan/types';
import { default as Save } from 'lucide-react/dist/esm/icons/save';

import type { BackendInputName, DirectorProfileInput, ReasoningEffort } from '../../api/types.ts';

import { launchTargetDefaultDisplay } from '../../components/shared/launchTargetControlModel.ts';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useLaunchDefaults } from '../../hooks/useLaunchDefaults.ts';
import { backendOptions } from '../../lib/backends.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { EffectiveModelHint } from '../settings/EffectiveModelHint.tsx';
import { textareaClass } from './directorUtils.ts';

const reasoningOptions: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export function DirectorProfileSection({
	dirty,
	form,
	onChange,
	onSave,
	pending,
}: {
	/** Whether the form differs from the saved record. Drives this island's whole save vocabulary. */
	dirty: boolean;
	form: DirectorProfileInput;
	onChange: (updater: (current: DirectorProfileInput) => DirectorProfileInput) => void;
	onSave: () => void;
	pending: boolean;
}) {
	const defaults = useLaunchDefaults(
		undefined,
		'interview',
		normalizeBackendName(form.backend ?? 'native'),
	);
	const defaultDisplay = launchTargetDefaultDisplay({
		backend: defaults.data?.effective.backend,
		isLoading: defaults.isLoading,
		model: defaults.data?.effective.model,
		modelSource: defaults.data?.effective.modelSource,
		provider: defaults.data?.effective.provider,
	});
	return (
		// A sunken card with a violet 'own record' badge: the profile is a separate object with its
		// own endpoint, so it is presented as one rather than as a section that happens to ignore
		// the toolbar's Save.
		<section aria-labelledby="director-profile-heading" className="@container">
			<Card className="flex flex-col gap-3" variant="sunken">
				<CardHeader
					action={<Badge tone="neutral">Own record</Badge>}
					className="mb-0"
					description="CLI, model, and behavior used when running cycles and chat."
					id="director-profile-heading"
					title="Director Profile"
				/>
				<FormGrid className="@min-[45rem]:grid-cols-2 @min-[61rem]:grid-cols-3">
					<FieldRow label="CLI">
						<select
							className={`${selectClass} w-full`}
							onChange={(event) =>
								onChange((current) => ({
									...current,
									backend: event.target.value as BackendInputName,
								}))
							}
							value={form.backend ?? 'native'}>
							{backendOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</FieldRow>
					<FieldRow
						hint={
							!form.model ? (
								<EffectiveModelHint
									model={defaultDisplay.modelLabel}
									text={defaultDisplay.modelProvenance}
								/>
							) : undefined
						}
						label="Model">
						<Input
							className="w-full font-mono"
							onChange={(event) =>
								onChange((current) => ({ ...current, model: event.target.value }))
							}
							placeholder={defaultDisplay.modelPlaceholder}
							value={form.model ?? ''}
						/>
					</FieldRow>
					<FieldRow label="Reasoning">
						<select
							className={`${selectClass} w-full`}
							onChange={(event) =>
								onChange((current) => ({
									...current,
									reasoningEffort: event.target.value as ReasoningEffort,
								}))
							}
							value={form.reasoningEffort ?? 'low'}>
							{reasoningOptions.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
					</FieldRow>
					<FieldRow label="Role">
						<Input
							className="w-full"
							onChange={(event) =>
								onChange((current) => ({ ...current, role: event.target.value }))
							}
							value={form.role ?? ''}
						/>
					</FieldRow>
					<FieldRow className="@min-[45rem]:col-span-2" label="Behavior">
						<textarea
							className={textareaClass}
							onChange={(event) =>
								onChange((current) => ({
									...current,
									instructions: event.target.value,
								}))
							}
							value={form.instructions ?? ''}
						/>
					</FieldRow>
				</FormGrid>
				<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
					<p className="text-xs text-muted-foreground" role="status">
						{pending
							? 'Saving Fleet Director profile…'
							: dirty
								? 'Unsaved Fleet Director profile changes.'
								: 'Fleet Director profile saved.'}
					</p>
					<Button
						disabled={pending || !dirty}
						onClick={onSave}
						size="compact"
						variant="secondary">
						<Save aria-hidden="true" className="h-4 w-4" />
						{pending ? 'Saving…' : 'Save Profile'}
					</Button>
				</div>
			</Card>
		</section>
	);
}
