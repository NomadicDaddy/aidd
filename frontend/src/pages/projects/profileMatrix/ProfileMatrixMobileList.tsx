import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { Link } from 'react-router';

import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type { ProfileMatrixRowModel } from './profileMatrixTypes.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { profileFacets } from '../detail/profile/profile-facets.ts';
import { sourceLabel, unsavedBadgeLabel } from './profileMatrixLabels.ts';
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
		<div className="space-y-3 md:hidden">
			{rows.map((row) => {
				const auditCount = row.preview?.audits.length ?? 0;
				const applicable = row.preview?.audits.filter((audit) => audit.applies).length ?? 0;
				const required =
					row.preview?.audits.filter((audit) => audit.effect === 'required').length ?? 0;
				return (
					<Card
						className={row.dirty ? 'border-l-2 border-l-amber-500/60' : ''}
						key={row.project.id}>
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0">
								<Link
									className="block truncate text-sm font-semibold text-foreground hover:underline"
									to={`/projects/${encodeURIComponent(row.project.routeId)}?tab=profile`}>
									{row.project.name}
								</Link>
								<p className="truncate font-mono text-2xs text-muted-foreground">
									{row.project.path}
								</p>
							</div>
							<div className="flex shrink-0 flex-wrap justify-end gap-1.5">
								<Badge
									tone={
										row.project.metadata.profile.source === 'explicit'
											? 'teal'
											: 'neutral'
									}>
									{sourceLabel(row.project.metadata.profile.source)}
								</Badge>
								{row.dirty && <Badge tone="amber">{unsavedBadgeLabel}</Badge>}
							</div>
						</div>
						<div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
							<Badge tone={row.posture.tone}>{row.posture.label}</Badge>
							<span className="text-muted-foreground tabular-nums">
								{applicable}/{auditCount} apply · {required} required
							</span>
						</div>
						{showFacets ? (
							<div className="mt-3 space-y-2">
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
						) : null}
						<div className="mt-3 flex items-center gap-2">
							<Button
								aria-label={`Save ${row.project.name} profile`}
								disabled={!row.dirty || row.saving}
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
								disabled={!row.dirty || row.saving}
								onClick={() => onReset(row.project.id)}
								size="compact"
								variant="secondary">
								<RotateCcw className="h-3.5 w-3.5" />
							</Button>
						</div>
					</Card>
				);
			})}
		</div>
	);
}
