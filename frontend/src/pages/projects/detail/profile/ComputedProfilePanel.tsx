import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';

import type { ProfilePreview } from '../../../../api/projects.ts';
import type { ProjectAssuranceProfileInput } from '../../../../api/types.ts';

import { Badge } from '../../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../../components/ui/card.tsx';
import { cn } from '../../../../lib/cn.ts';
import { toneText } from '../../../../lib/tones.ts';
import { effectTone } from '../../../audits/auditsUtils.ts';
import { getProfilePosture } from '../../profile/profile-helpers.ts';

export function ComputedProfilePanel({
	dirty,
	form,
	isPreviewError,
	isPreviewing,
	mode = 'full',
	preview,
	source,
}: {
	dirty: boolean;
	form: ProjectAssuranceProfileInput;
	isPreviewError: boolean;
	isPreviewing: boolean;
	mode?: 'audits' | 'full' | 'summary';
	preview: ProfilePreview | undefined;
	source: 'explicit' | 'inferred';
}) {
	const posture = getProfilePosture(form);

	const audits = preview?.audits ?? [];
	const applicable = audits.filter((audit) => audit.applies);
	const required = audits.filter((audit) => audit.effect === 'required');
	const suppressed = audits.filter((audit) => !audit.applies);

	// The rail is a grid item in ProfileTab's lg:grid-cols-[1.5fr_1fr]. Without lg:self-start it
	// stretches to the full row height, which leaves position: sticky nothing to slide within and
	// the declaration is inert. self-start restores the slide, and the viewport-height cap plus the
	// flexing audit list keep the posture readable beside whichever facet is being changed.
	//
	// This rail is now read-only. Save and Reset moved to the foot of the form column, because a
	// rail two cards shorter than the form put the commit action level with the third facet, with
	// three more cards of unread fields below it.
	return (
		<div
			className={
				mode === 'full'
					? 'flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start'
					: 'flex flex-col gap-4'
			}>
			{mode !== 'audits' ? (
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
						<Badge tone="neutral">{posture.label}</Badge>
						<Badge tone="neutral">saved: {source}</Badge>
						{audits.length > 0 ? (
							<Badge tone="neutral">
								{applicable.length}/{audits.length} audits apply · {required.length}{' '}
								required
							</Badge>
						) : null}
					</div>
					{mode !== 'summary' ? (
						<p className="mt-2 text-xs text-muted-foreground">{posture.description}</p>
					) : null}
					{mode !== 'summary' && posture.reasons.length > 0 && (
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
			) : null}

			{mode !== 'summary' ? (
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
								// The chip trails the name at a fixed distance rather than being pushed
								// to the far edge. Distributed, a 161px name and a 63px badge left a
								// measured 505px between them on a 737px row, 42 rows deep, so the list
								// read as two unrelated columns instead of 42 pairs.
								<div
									className="flex items-center gap-2 rounded px-1 py-0.5"
									key={audit.name}>
									<span
										className={cn(
											'min-w-0 flex-1 truncate text-sm',
											audit.applies
												? 'text-foreground'
												: 'text-muted-foreground line-through',
										)}
										title={audit.name}>
										{audit.name}
									</span>
									<Badge className="shrink-0" tone={effectTone[audit.effect]}>
										{audit.effect}
									</Badge>
								</div>
							))}
						</div>
					)}
					{suppressed.length > 0 && !isPreviewError && (
						<p className="mt-2 text-xs text-muted-foreground">
							{suppressed.length} audit{suppressed.length === 1 ? '' : 's'} excluded
							or disabled under this profile.
						</p>
					)}
				</Card>
			) : null}
		</div>
	);
}
