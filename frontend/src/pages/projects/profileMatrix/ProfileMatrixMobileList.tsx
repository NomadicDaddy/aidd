import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useState } from 'react';
import { Link } from 'react-router';

import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type { ProfileMatrixRowModel, ProfileMatrixSortKey } from './profileMatrixTypes.ts';

import { CardSortControl } from '../../../components/shared/CardSortControl.tsx';
import { DisclosureMarker } from '../../../components/shared/DisclosureMarker.tsx';
import { FilePath } from '../../../components/shared/FilePath.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { toneBorder } from '../../../lib/tones.ts';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { sectionCaptionClass } from '../../../lib/typography.ts';
import { profileFacets } from '../detail/profile/profile-facets.ts';
import {
	formatUpdatedAt,
	hardeningTriggerLabel,
	sourceLabel,
	unsavedBadgeLabel,
} from './profileMatrixLabels.ts';
import { ProfileFacetSelect } from './ProfileMatrixRow.tsx';
import { profileMatrixSortOptions } from './profileMatrixSorting.ts';

/**
 * The narrow-viewport counterpart to `ProfileMatrixTable`, following the split every other wide
 * table in the app already ships (`AuditsDesktopTable` + `AuditsMobileList`). At 768 the table put
 * 75% of its width off-screen and spent 47% of what remained on the pinned identity column.
 */
export function ProfileMatrixMobileList({
	onChange,
	onReset,
	onSave,
	onSort,
	rows,
	showFacets,
	sortDir,
	sortKey,
}: {
	onChange: (
		projectId: string,
		field: FacetField,
		value: ProjectAssuranceProfileInput[FacetField],
	) => void;
	onReset: (projectId: string) => void;
	onSave: (projectId: string) => void;
	onSort: (key: ProfileMatrixSortKey) => void;
	rows: ProfileMatrixRowModel[];
	showFacets: boolean;
	sortDir: 'asc' | 'desc';
	sortKey: ProfileMatrixSortKey;
}) {
	const [activeProjectId, setActiveProjectId] = useState<null | string>(null);
	// The facet keys are offered exactly when the facet columns exist in the table, so the two views
	// sort on the same set rather than the cards quietly keeping a key the table has put away.
	const sortOptions = showFacets
		? [
				...profileMatrixSortOptions,
				...profileFacets.map((facet) => ({ key: facet.field, label: facet.title })),
			]
		: profileMatrixSortOptions;

	return (
		<div className="space-y-3 xl:hidden">
			{/* The table sorts through its column headers, which do not exist here. Without this the
			    same 33 rows were locked to Project-ascending for every viewport below 1280. */}
			<CardSortControl
				onToggleSort={onSort}
				options={sortOptions}
				sortDir={sortDir}
				sortKey={sortKey}
			/>
			{rows.map((row) => {
				const facetsOpen = showFacets && activeProjectId === row.project.id;
				const auditCount = row.preview?.audits.length ?? 0;
				const applicable = row.preview?.audits.filter((audit) => audit.applies).length ?? 0;
				const required =
					row.preview?.audits.filter((audit) => audit.effect === 'required').length ?? 0;
				return (
					<Card
						// Only the left edge carries width, so a tone that colours all four is fine.
						className={row.dirty ? `border-l-2 ${toneBorder.amber}` : ''}
						key={row.project.id}>
						{/* Name, path and badges through the shared header rather than three stacked
						    blocks of the card's own. It is the same information in one wrap row plus
						    the path line: badges that fit beside the name sit beside it and only wrap
						    when they cannot, which took the head of a clean card from three lines to
						    two and the whole card from ~131px to ~90px. Fifteen cards at 1024 gained
						    most of a card's worth of screen back. */}
						<CardHeader
							badge={
								<span className="flex flex-wrap items-center gap-1.5">
									<Badge tone="neutral">
										{sourceLabel(row.project.metadata.profile.source)}
									</Badge>
									{row.dirty && <Badge tone="amber">{unsavedBadgeLabel}</Badge>}
									<Badge tone="neutral">{row.posture.label}</Badge>
								</span>
							}
							className="mb-2"
							identifier={<FilePath className="text-2xs" path={row.project.path} />}
							level="subsection"
							title={
								<Link
									// A two-character project name (`g5`) measured 17.9px wide. The
									// link is the sole child of its heading, so the horizontal floor
									// costs nothing here.
									className={`block truncate hover:underline max-sm:min-w-11 ${touchTargetTextClass}`}
									to={`/projects/${encodeURIComponent(row.project.routeId)}?tab=profile`}>
									{row.project.name}
								</Link>
							}
						/>
						{/* Everything the table's remaining columns carry. A card that printed the
						    audit counts and stopped would silently lose the posture reasons and the
						    Updated column on a phone — a viewport that drops information is the
						    failure the table/card split exists to avoid, not a licence it grants. */}
						<div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
							<Button
								aria-controls={`profile-matrix-facets-${row.project.routeId}`}
								aria-expanded={facetsOpen}
								aria-label={`${facetsOpen ? 'Close' : 'Edit'} facets for ${row.project.name}`}
								className="mt-3 min-h-11"
								onClick={() =>
									setActiveProjectId(facetsOpen ? null : row.project.id)
								}
								size="compact"
								variant="secondary">
								<DisclosureMarker open={facetsOpen} />
								{facetsOpen ? 'Close facets' : 'Edit facets'}
							</Button>
						) : null}
						{facetsOpen ? (
							<div
								className="mt-3 border-t border-border pt-3"
								id={`profile-matrix-facets-${row.project.routeId}`}>
								{/* A rule and a section label: without them the six facet fields read as
								    a flat form that happens to start after some badges, with nothing
								    marking which project they belong to. */}
								<h3 className={sectionCaptionClass}>Assurance facets</h3>
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
