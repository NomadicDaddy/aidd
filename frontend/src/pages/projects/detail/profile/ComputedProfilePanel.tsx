import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Save } from 'lucide-react/dist/esm/icons/save';

import type { ProfilePreview } from '../../../../api/projects.ts';
import type { ProjectAssuranceProfileInput } from '../../../../api/types.ts';

import { Badge } from '../../../../components/ui/badge.tsx';
import { Button } from '../../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../../components/ui/card.tsx';
import { toneText } from '../../../../lib/tones.ts';
import { effectTone } from '../../../audits/auditsUtils.ts';
import { getProfilePosture } from '../../profile/profile-helpers.ts';

export function ComputedProfilePanel({
	dirty,
	form,
	isPreviewError,
	isPreviewing,
	isSaving,
	onReset,
	onSave,
	preview,
	source,
}: {
	dirty: boolean;
	form: ProjectAssuranceProfileInput;
	isPreviewError: boolean;
	isPreviewing: boolean;
	isSaving: boolean;
	onReset: () => void;
	onSave: () => void;
	preview: ProfilePreview | undefined;
	source: 'explicit' | 'inferred';
}) {
	const posture = getProfilePosture(form);

	const audits = preview?.audits ?? [];
	const applicable = audits.filter((audit) => audit.applies);
	const required = audits.filter((audit) => audit.effect === 'required');
	const suppressed = audits.filter((audit) => !audit.applies);

	// The rail is a grid item in ProfileTab's lg:grid-cols-[1.5fr_1fr]. Without lg:self-start it
	// stretches to the full row height, which leaves position: sticky nothing to slide within — the
	// declaration was inert and Save/Reset scrolled away. self-start restores the slide, and the
	// viewport-height cap plus the flexing audit list keep the buttons on screen even when the
	// audit catalog is long.
	return (
		<div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start">
			<Card className="lg:shrink-0" variant="panel">
				<CardHeader
					action={
						isPreviewing ? (
							<span className="flex items-center gap-1 text-xs text-muted-foreground">
								<Loader2 className="h-3 w-3 animate-spin" />
								Recalculating…
							</span>
						) : (
							dirty && (
								<span className={`text-xs font-medium ${toneText.amber}`}>
									Unsaved
								</span>
							)
						)
					}
					className="mb-3"
					title="Computed posture"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Badge tone={posture.tone}>{posture.label}</Badge>
					<Badge tone={source === 'explicit' ? 'teal' : 'neutral'}>saved: {source}</Badge>
				</div>
				<p className="mt-2 text-xs text-muted-foreground">{posture.description}</p>
				{posture.reasons.length > 0 && (
					<ul className="mt-2 space-y-1">
						{posture.reasons.map((reason) => (
							<li
								className="flex items-start gap-1.5 text-xs text-muted-foreground"
								key={reason}>
								<span aria-hidden="true" className={toneText.red}>
									⊕
								</span>
								{reason}
							</li>
						))}
					</ul>
				)}
			</Card>

			<Card className="lg:flex lg:min-h-0 lg:flex-col" variant="panel">
				<CardHeader
					action={
						audits.length > 0 && (
							<span className="text-xs text-muted-foreground tabular-nums">
								{applicable.length}/{audits.length} apply · {required.length}{' '}
								required
							</span>
						)
					}
					className="mb-3"
					title="Applicable audits"
				/>
				{isPreviewError ? (
					<p className={`text-sm ${toneText.red}`}>
						Could not compute audit applicability.
					</p>
				) : audits.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{isPreviewing ? 'Computing…' : 'No audits found for this project.'}
					</p>
				) : (
					<div className="max-h-[28rem] space-y-1 overflow-y-auto pr-1 lg:max-h-none lg:min-h-0 lg:flex-1">
						{audits.map((audit) => (
							<div
								className="flex items-center justify-between gap-2 rounded px-1 py-0.5"
								key={audit.name}>
								<span
									className={
										audit.applies
											? 'text-sm text-foreground'
											: 'text-sm text-muted-foreground line-through'
									}>
									{audit.name}
								</span>
								<Badge tone={effectTone[audit.effect]}>{audit.effect}</Badge>
							</div>
						))}
					</div>
				)}
				{suppressed.length > 0 && !isPreviewError && (
					<p className="mt-2 text-xs text-muted-foreground">
						{suppressed.length} audit{suppressed.length === 1 ? '' : 's'} excluded or
						disabled under this profile.
					</p>
				)}
			</Card>

			<div className="flex items-center gap-2 lg:shrink-0">
				<Button
					className="flex-1"
					disabled={!dirty || isSaving}
					onClick={onSave}
					variant="primary">
					{isSaving ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Save className="h-4 w-4" />
					)}
					Save profile
				</Button>
				<Button disabled={!dirty || isSaving} onClick={onReset} variant="secondary">
					<RotateCcw className="h-4 w-4" />
					Reset
				</Button>
			</div>
		</div>
	);
}
