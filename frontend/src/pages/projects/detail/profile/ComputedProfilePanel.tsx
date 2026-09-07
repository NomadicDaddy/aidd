import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';

import type { ProfilePreview } from '../../../../api/projects.ts';
import type { ProjectAssuranceProfileInput } from '../../../../api/types.ts';

import { Metric } from '../../../../components/shared/Metric.tsx';
import { OverflowScroller } from '../../../../components/shared/OverflowScroller.tsx';
import { Badge, StatusDot } from '../../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../../components/ui/card.tsx';
import { useViewportFill } from '../../../../hooks/useViewportFill.ts';
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
	savedPreview,
}: {
	dirty: boolean;
	form: ProjectAssuranceProfileInput;
	isPreviewError: boolean;
	isPreviewing: boolean;
	mode?: 'audits' | 'full' | 'summary';
	preview: ProfilePreview | undefined;
	savedPreview: ProfilePreview | undefined;
}) {
	const posture = getProfilePosture(form);

	const audits = preview?.audits ?? [];
	const applicable = audits.filter((audit) => audit.applies);
	const required = audits.filter((audit) => audit.effect === 'required');
	const suppressed = audits.filter((audit) => !audit.applies);
	const savedAudits = savedPreview?.audits ?? [];
	const savedApplicable = savedAudits.filter((audit) => audit.applies);
	const savedRequired = savedAudits.filter((audit) => audit.effect === 'required');
	const savedByName = new Map(savedAudits.map((audit) => [audit.name, audit]));
	const changedAuditNames = new Set(
		dirty
			? audits
					.filter((audit) => {
						const saved = savedByName.get(audit.name);
						return (
							saved === undefined ||
							saved.applies !== audit.applies ||
							saved.effect !== audit.effect
						);
					})
					.map((audit) => audit.name)
			: [],
	);
	const auditMovement =
		dirty && savedPreview !== undefined
			? `${savedApplicable.length}→${applicable.length} apply · ${savedRequired.length}→${required.length} required`
			: `${applicable.length}/${audits.length} apply · ${required.length} required`;
	const auditsScrollerRef = useViewportFill<HTMLDivElement>({
		floor: 'compact',
		refreshKey: audits.length,
	});

	// This rail is read-only. It follows the same shell-published sticky offset as the editor action
	// bar beside it, so the two sibling plates remain aligned while the profile scrolls.
	return (
		<div
			className={
				mode === 'full'
					? 'flex flex-col gap-4 lg:sticky lg:top-[var(--app-topbar-height,0px)] lg:max-h-[calc(100dvh-var(--app-topbar-height,0px)-2rem)]'
					: 'flex flex-col gap-4'
			}>
			{mode !== 'audits' ? (
				<Metric
					className="lg:shrink-0"
					detail={mode !== 'summary' ? posture.description : undefined}
					footer={
						isPreviewing ||
						dirty ||
						(mode !== 'summary' && posture.reasons.length > 0) ? (
							<div className="mt-3 space-y-2">
								{isPreviewing ? (
									<span className="flex items-center gap-1 text-xs text-muted-foreground">
										<Loader2 className="h-3 w-3 animate-spin" />
										Recalculating…
									</span>
								) : dirty ? (
									<span
										className={`flex items-center gap-1.5 text-xs font-medium ${toneText.amber}`}>
										<StatusDot tone="amber" />
										Preview
									</span>
								) : null}
								{mode !== 'summary' && posture.reasons.length > 0 ? (
									<ul className="space-y-1">
										{posture.reasons.map((reason) => (
											<li
												className="flex items-start gap-1.5 text-xs text-muted-foreground"
												key={reason}>
												<StatusDot className="mt-1" tone="red" />
												{reason}
											</li>
										))}
									</ul>
								) : null}
							</div>
						) : undefined
					}
					headingLevel={3}
					label="Computed posture"
					value={posture.label}
				/>
			) : null}

			{mode !== 'summary' ? (
				<Card className="@container/audits lg:flex lg:min-h-0 lg:flex-col" variant="panel">
					<CardHeader
						action={
							audits.length > 0 && (
								<span className="text-xs text-muted-foreground tabular-nums">
									{auditMovement}
								</span>
							)
						}
						className="mb-3"
						headingLevel={3}
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
						<OverflowScroller
							ariaLabel="Applicable audits"
							className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
							rootRef={auditsScrollerRef}
							scrollerClassName="max-h-[28rem] overflow-y-auto pr-1 lg:max-h-[var(--fill-height)] lg:min-h-0 lg:flex-1"
							showTopCue>
							{/* Named to the audits container, which is 320px inside a 390px viewport and
							    290px inside a 360px one — well under the 416px step, so a phone always
							    reads this as one column. That is the intended phone branch: each row is an
							    audit name with a chip trailing it at a fixed distance, and two 145px columns
							    would truncate names like AGENT_TOOL_SANDBOX before the chip they belong to. */}
							<div className="grid gap-1 @min-[40rem]/audits:grid-cols-2">
								{audits.map((audit) => {
									const changed = changedAuditNames.has(audit.name);
									return (
										// The chip trails the name at a fixed distance rather than being pushed
										// to the far edge. Distributed, a 161px name and a 63px badge left a
										// measured 505px between them on a 737px row, 42 rows deep, so the list
										// read as two unrelated columns instead of 42 pairs.
										<div
											className="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-muted"
											key={audit.name}>
											{changed ? <StatusDot tone="amber" /> : null}
											<span
												className={cn(
													'max-w-full min-w-0 font-mono text-sm font-medium [overflow-wrap:anywhere]',
													audit.applies
														? 'text-foreground'
														: 'text-muted-foreground line-through',
												)}>
												{audit.name}
											</span>
											<Badge
												className="shrink-0"
												tone={effectTone[audit.effect]}>
												{audit.effect}
											</Badge>
										</div>
									);
								})}
							</div>
						</OverflowScroller>
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
