import { default as Save } from 'lucide-react/dist/esm/icons/save';

import type { BackendInputName, DirectorProfileInput, ReasoningEffort } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { backendOptions } from '../../lib/backends.ts';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { sectionDescClass, sectionTitleClass, textareaClass } from './directorUtils.ts';

const reasoningOptions: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export function DirectorProfileSection({
	form,
	onChange,
	onSave,
	pending,
}: {
	form: DirectorProfileInput;
	onChange: (updater: (current: DirectorProfileInput) => DirectorProfileInput) => void;
	onSave: () => void;
	pending: boolean;
}) {
	return (
		// A sunken card with a violet 'own record' badge: the profile is a separate object with its
		// own endpoint, so it is presented as one rather than as a section that happens to ignore
		// the toolbar's Save.
		<section aria-labelledby="director-profile-heading">
			<Card variant="sunken">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 className={sectionTitleClass} id="director-profile-heading">
							Director Profile
						</h2>
						<p className={sectionDescClass}>
							Backend, model, and behavior used when running cycles and chat.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Badge tone="neutral">Own record</Badge>
						<Button disabled={pending} onClick={onSave} variant="secondary">
							<Save aria-hidden="true" className="h-4 w-4" />
							{pending ? 'Saving…' : 'Save Profile'}
						</Button>
					</div>
				</div>
				<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<label className="space-y-1">
						<span className={fieldLabelClass}>Backend</span>
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
					</label>
					<label className="space-y-1">
						<span className={fieldLabelClass}>Model</span>
						<Input
							className="w-full"
							onChange={(event) =>
								onChange((current) => ({ ...current, model: event.target.value }))
							}
							value={form.model ?? ''}
						/>
					</label>
					<label className="space-y-1">
						<span className={fieldLabelClass}>Reasoning</span>
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
					</label>
					<label className="space-y-1">
						<span className={fieldLabelClass}>Role</span>
						<Input
							className="w-full"
							onChange={(event) =>
								onChange((current) => ({ ...current, role: event.target.value }))
							}
							value={form.role ?? ''}
						/>
					</label>
				</div>
				<label className="mt-3 block space-y-1">
					<span className={fieldLabelClass}>Behavior</span>
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
				</label>
			</Card>
		</section>
	);
}
