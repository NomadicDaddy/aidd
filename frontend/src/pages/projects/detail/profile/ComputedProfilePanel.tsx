import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Save } from 'lucide-react/dist/esm/icons/save';

import type { ProfilePreview } from '../../../../api/projects.ts';
import type { ProjectAssuranceProfileInput } from '../../../../api/types.ts';

import { Badge } from '../../../../components/ui/badge.tsx';
import { Button } from '../../../../components/ui/button.tsx';
import { Card } from '../../../../components/ui/card.tsx';
import { getProfilePosture } from '../../profile/profile-helpers.ts';

const effectTone = {
	default: 'emerald',
	disabled: 'neutral',
	excluded: 'red',
	required: 'cyan',
} as const;

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

	return (
		<div className="flex flex-col gap-4 lg:sticky lg:top-4">
			<Card variant="panel">
				<div className="mb-3 flex items-center justify-between gap-2">
					<h2 className="text-foreground text-sm font-semibold">Computed posture</h2>
					{isPreviewing ? (
						<span className="text-muted-foreground flex items-center gap-1 text-xs">
							<Loader2 className="h-3 w-3 animate-spin" />
							Recalculating…
						</span>
					) : (
						dirty && (
							<span className="text-xs font-medium text-amber-600 dark:text-amber-400">
								Unsaved
							</span>
						)
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Badge tone={posture.tone}>{posture.label}</Badge>
					<Badge tone={source === 'explicit' ? 'cyan' : 'neutral'}>saved: {source}</Badge>
				</div>
				<p className="text-muted-foreground mt-2 text-xs">{posture.description}</p>
				{posture.reasons.length > 0 && (
					<ul className="mt-2 space-y-1">
						{posture.reasons.map((reason) => (
							<li
								className="text-muted-foreground flex items-start gap-1.5 text-xs"
								key={reason}>
								<span className="text-red-500">⊕</span>
								{reason}
							</li>
						))}
					</ul>
				)}
			</Card>

			<Card variant="panel">
				<div className="mb-3 flex items-center justify-between gap-2">
					<h2 className="text-foreground text-sm font-semibold">Applicable audits</h2>
					{audits.length > 0 && (
						<span className="text-muted-foreground text-xs tabular-nums">
							{applicable.length}/{audits.length} apply · {required.length} required
						</span>
					)}
				</div>
				{isPreviewError ? (
					<p className="text-sm text-red-600 dark:text-red-400">
						Could not compute audit applicability.
					</p>
				) : audits.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{isPreviewing ? 'Computing…' : 'No audits found for this project.'}
					</p>
				) : (
					<div className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
						{audits.map((audit) => (
							<div
								className="flex items-center justify-between gap-2 rounded px-1 py-0.5"
								key={audit.name}>
								<span
									className={
										audit.applies
											? 'text-foreground text-sm'
											: 'text-muted-foreground text-sm line-through'
									}>
									{audit.name}
								</span>
								<Badge tone={effectTone[audit.effect]}>{audit.effect}</Badge>
							</div>
						))}
					</div>
				)}
				{suppressed.length > 0 && !isPreviewError && (
					<p className="text-muted-foreground mt-2 text-xs">
						{suppressed.length} audit{suppressed.length === 1 ? '' : 's'} excluded or
						disabled under this profile.
					</p>
				)}
			</Card>

			<div className="flex items-center gap-2">
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
