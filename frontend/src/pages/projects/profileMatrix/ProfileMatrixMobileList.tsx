import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { Link } from 'react-router';

import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type { ProfileMatrixRowModel } from './profileMatrixTypes.ts';

import { FilePath } from '../../../components/shared/FilePath.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { toneBorder } from '../../../lib/tones.ts';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { profileFacets } from '../detail/profile/profile-facets.ts';
import {
	formatUpdatedAt,
	hardeningTriggerLabel,
	sourceLabel,
	unsavedBadgeLabel,
} from './profileMatrixLabels.ts';
import { ProfileFacetSelect } from './ProfileMatrixRow.tsx';

/**
 * The narrow-viewport counterpart to `ProfileMatrixTable`, following the split every other wide
 * table in the app already ships (`AuditsDesktopTable` + `AuditsMobileList`). At 768 the table put
 * 75% of its width off-screen and spent 47% of what remained on the pinned identity column.
 */
export function ProfileMatrixMobileList({
	onChange,
	onReset,
	onSave,
	rows,
	showFacets,
}: {
	onChange: (
		projectId: string,
		field: FacetField,
		value: ProjectAssuranceProfileInput[FacetField],
	) => void;
	onReset: (projectId: string) => void;
	onSave: (projectId: string) => void;
	rows: ProfileMatrixRowModel[];
	showFacets: boolean;
}) {
	return (
		<div className="space-y-3 xl:hidden">
			{rows.map((row) => {
				const auditCount = row.preview?.audits.length ?? 0;
				const applicable = row.preview?.audits.filter((audit) => audit.applies).length ?? 0;
				const required =
					row.preview?.audits.filter((audit) => audit.effect === 'required').length ?? 0;
				return (
					<Card
						// Only the left edge carries width, so a tone that colours all four is fine.
						className={row.dirty ? `border-l-2 ${toneBorder.amber}` : ''}
						key={row.project.id}>
						{/* The card is a heading and its detail, not a two-column split. The badges used
						    to sit in a `shrink-0` cluster on the right, which took a third of a 358px
						    card away from the one line that says which project this is — and the name
						    is the only thing that distinguishes one card from the next fourteen. They
						    are a row under it now, where they wrap into the width they need. */}
						<h2 className="text-sm font-semibold text-foreground">
							<Link
								// A two-character project name (`g5`) measured 17.9px wide. The link
								// is the sole child of its heading, so the horizontal floor costs
								// nothing here.
								className={`block truncate hover:underline max-sm:min-w-11 ${touchTargetTextClass}`}
								to={`/projects/${encodeURIComponent(row.project.routeId)}?tab=profile`}>
								{row.project.name}
							</Link>
						</h2>
						<FilePath
							className="block truncate text-2xs text-muted-foreground"
							path={row.project.path}
						/>
						<div className="mt-2 flex flex-wrap items-center gap-1.5">
							<Badge tone="neutral">
								{sourceLabel(row.project.metadata.profile.source)}
							</Badge>
							{row.dirty && <Badge tone="amber">{unsavedBadgeLabel}</Badge>}
							<Badge tone="neutral">{row.posture.label}</Badge>
						</div>
						{/* Everything the table's remaining columns carry. The card used to print the
						    audit counts and stop, so a phone silently lost the posture reasons and the
						    Updated column — a viewport that drops information is the failure the
						    table/card split exists to avoid, not a licence it grants. */}
						<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
							<span className="tabular-nums">
								{applicable}/{auditCount} apply · {required} required
							</span>
							{row.posture.reasons.length > 0 && (
								<span>{hardeningTriggerLabel(row.posture.reasons.length)}</span>
							)}
							<span>
								Updated {formatUpdatedAt(row.project.metadata.profile.updatedAt)}
							</span>
						</div>
						{showFacets ? (
							<div className="mt-3 border-t border-border pt-3">
								{/* A rule and a section label: without them the six facet fields read as
								    a flat form that happens to start after some badges, with nothing
								    marking which project they belong to. */}
								<h3 className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
									Assurance facets
								</h3>
								<div className="mt-2 space-y-2">
									{profileFacets.map((facet) => (
										<label className="block space-y-1" key={facet.field}>
											<span className={fieldLabelClass}>{facet.title}</span>
											<ProfileFacetSelect
												field={facet.field}
												onChange={onChange}
												projectName={row.project.name}
												row={row}
											/>
										</label>
									))}
								</div>
							</div>
						) : null}
						{/* Same rule as the table: a card that has nothing to commit renders no
						    commit controls rather than two dead ones. */}
						{row.dirty ? (
							<div className="mt-3 flex items-center gap-2">
								<Button
									aria-label={`Save ${row.project.name} profile`}
									disabled={row.saving}
									onClick={() => onSave(row.project.id)}
									size="compact"
									variant="primary">
									{row.saving ? (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									) : (
										<Save className="h-3.5 w-3.5" />
									)}
									Save
								</Button>
								<Button
									aria-label={`Reset ${row.project.name} profile`}
									disabled={row.saving}
									onClick={() => onReset(row.project.id)}
									size="compact"
									variant="secondary">
									<RotateCcw className="h-3.5 w-3.5" />
								</Button>
							</div>
						) : null}
					</Card>
				);
			})}
		</div>
	);
}
