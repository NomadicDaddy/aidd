import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { Link } from 'react-router';

import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField, ProfileFacet } from '../detail/profile/profile-facets.ts';
import type { ProfileMatrixRowModel } from './profileMatrixTypes.ts';

import { FilePath } from '../../../components/shared/FilePath.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { IconButton } from '../../../components/ui/button.tsx';
import { cn } from '../../../lib/cn.ts';
import { quietSelectClass } from '../../../lib/formStyles.ts';
import { interactiveTableRowClass, pinnedLeftEdgeClass } from '../../../lib/tableStyles.ts';
import { toneBorder, toneSurface } from '../../../lib/tones.ts';
import { profileFacets } from '../detail/profile/profile-facets.ts';
import {
	formatUpdatedAt,
	hardeningTriggerLabel,
	sourceLabel,
	unsavedBadgeLabel,
} from './profileMatrixLabels.ts';

/**
 * One facet dropdown. Its quiet shared skin keeps the value readable at rest and restores full
 * control chrome on row hover or focus, which matters when all ten facets repeat down every row.
 */
export function ProfileFacetSelect({
	field,
	onChange,
	projectName,
	row,
}: {
	field: FacetField;
	onChange: (
		projectId: string,
		field: FacetField,
		value: ProjectAssuranceProfileInput[FacetField],
	) => void;
	projectName: string;
	row: ProfileMatrixRowModel;
}) {
	const facet = profileFacets.find((candidate) => candidate.field === field);
	if (!facet) return null;
	return (
		<select
			aria-label={`${projectName} ${facet.title}`}
			// `w-full` with no min of its own: the `min-w-40` on the column header is what sets the
			// track, so all visible selects come out one width instead of widths set by how long
			// each facet's title happens to be.
			className={`${quietSelectClass} h-8 w-full px-2 text-xs`}
			onChange={(event) =>
				onChange(
					row.project.id,
					field,
					event.target.value as ProjectAssuranceProfileInput[FacetField],
				)
			}
			value={row.form[field]}>
			{facet.options.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	);
}

export function ProfileMatrixRow({
	onChange,
	onReset,
	onSave,
	row,
	showFacets,
	visibleFacets,
}: {
	onChange: (
		projectId: string,
		field: FacetField,
		value: ProjectAssuranceProfileInput[FacetField],
	) => void;
	onReset: (projectId: string) => void;
	onSave: (projectId: string) => void;
	row: ProfileMatrixRowModel;
	/** Matches the header: the facet selects only exist in the page's edit-facets mode. */
	showFacets: boolean;
	visibleFacets: readonly ProfileFacet[];
}) {
	const auditCount = row.preview?.audits.length ?? 0;
	const applicable = row.preview?.audits.filter((audit) => audit.applies).length ?? 0;
	const required = row.preview?.audits.filter((audit) => audit.effect === 'required').length ?? 0;

	return (
		// A dirty row is promoted at row level, not just by a 40px badge: over a 3000px table the
		// badge scrolled out of reach and the header count was the only other signal. The tint plus
		// the amber rule on the pinned cell make the row findable from the sticky column alone.
		<tr
			className={`group group/quiet border-b border-border align-top ${interactiveTableRowClass} ${
				row.dirty ? toneSurface.amber : ''
			}`}
			data-dirty={row.dirty ? 'true' : undefined}>
			<th
				className={cn(
					'min-w-64 border-l-2 border-transparent px-3 py-3 text-left transition-colors',
					showFacets
						? `sticky left-0 z-10 bg-card group-hover:bg-muted ${pinnedLeftEdgeClass}`
						: 'group-hover:bg-muted/40',
					row.dirty && `border-l-2 ${toneBorder.amber}`,
					row.dirty && !showFacets && toneSurface.amber,
				)}>
				{row.dirty && showFacets ? (
					<span
						aria-hidden
						className={`pointer-events-none absolute inset-0 ${toneSurface.amber}`}
					/>
				) : null}
				<div className="relative min-h-10 pr-20">
					<Link
						className="block truncate text-sm font-semibold text-foreground hover:underline"
						to={`/projects/${encodeURIComponent(row.project.routeId)}?tab=profile`}>
						{row.project.name}
					</Link>
					<FilePath
						className="mt-1 block truncate text-2xs text-muted-foreground"
						path={row.project.path}
					/>
					{row.dirty ? (
						<div className="absolute top-0 right-0 flex items-center gap-1">
							<IconButton
								ariaLabel={`Save ${row.project.name} profile`}
								disabled={row.saving}
								onClick={() => onSave(row.project.id)}
								variant="primary">
								{row.saving ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Save className="h-3.5 w-3.5" />
								)}
							</IconButton>
							<IconButton
								ariaLabel={`Reset ${row.project.name} profile`}
								disabled={row.saving}
								onClick={() => onReset(row.project.id)}>
								<RotateCcw className="h-3.5 w-3.5" />
							</IconButton>
						</div>
					) : null}
				</div>
			</th>
			{/* Posture and Audits lead, Source trails — see the header comment in ProfileMatrixTable.
			    The two cells that recompute as facets change stay beside the pinned project name
			    instead of sitting 669px off the right edge of the scrollport in edit mode. */}
			<td className="px-3 py-3">
				{/* `items-start`: the column stretched its Badge into a 160px bar while the Source
				    Badge stayed an intrinsic pill — one component, two shapes. */}
				<div className="flex min-w-40 flex-col items-start gap-1">
					<Badge tone="neutral">{row.posture.label}</Badge>
					<span
						aria-hidden={row.posture.reasons.length === 0 ? 'true' : undefined}
						className={cn(
							'text-xs text-muted-foreground',
							row.posture.reasons.length === 0 && 'invisible',
						)}>
						{hardeningTriggerLabel(row.posture.reasons.length)}
					</span>
				</div>
			</td>
			{/* `whitespace-nowrap`: at 69px both lines wrapped, making this the tallest cell in
			    every row and setting an 89px row height across the whole table. */}
			<td className="min-w-28 px-3 py-3 text-xs whitespace-nowrap tabular-nums">
				<div>
					<span className="font-semibold text-foreground">{applicable}</span>
					<span className="font-semibold text-foreground">/{auditCount}</span>{' '}
					<span className="text-muted-foreground">apply</span>
				</div>
				<span className="text-xs text-muted-foreground">{required} required</span>
			</td>
			{showFacets
				? visibleFacets.map((facet) => (
						<td className="px-2 py-3" key={facet.field}>
							<ProfileFacetSelect
								field={facet.field}
								onChange={onChange}
								projectName={row.project.name}
								row={row}
							/>
						</td>
					))
				: null}
			<td className="px-3 py-3">
				{/* The Unsaved badge is always in the layout and only sometimes visible. Mounting it
				    on the first edit could not fit beside `Explicit` in a 91px cell, so it wrapped,
				    took the row from 65px to 79px and pushed every row below it down by 14px — the
				    table moved under the cursor on the keystroke that changed it. Reserving the space
				    costs one hidden pill and makes the height identical in both states. */}
				<div className="flex gap-1.5 whitespace-nowrap">
					<Badge tone="neutral">{sourceLabel(row.project.metadata.profile.source)}</Badge>
					<span
						aria-hidden={row.dirty ? undefined : 'true'}
						className={row.dirty ? '' : 'invisible'}>
						<Badge tone="amber">{unsavedBadgeLabel}</Badge>
					</span>
				</div>
			</td>
			<td className="px-3 py-3 text-xs whitespace-nowrap text-muted-foreground">
				{formatUpdatedAt(row.project.metadata.profile.updatedAt)}
			</td>
		</tr>
	);
}
