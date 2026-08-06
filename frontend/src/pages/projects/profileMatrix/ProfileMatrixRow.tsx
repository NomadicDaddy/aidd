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
import { selectClass } from '../../../lib/formStyles.ts';
import { pinnedLeftEdgeClass, pinnedRightEdgeClass } from '../../../lib/tableStyles.ts';
import { toneBorder, toneSurface } from '../../../lib/tones.ts';
import { profileFacets } from '../detail/profile/profile-facets.ts';
import { sourceLabel, unsavedBadgeLabel } from './profileMatrixLabels.ts';

function formatUpdatedAt(value: string): string {
	if (!value) return 'Unknown';
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}

/**
 * One facet dropdown. It reads its skin from the shared `selectClass` rather than a hand-rolled
 * class list: the literal it replaced painted `bg-background` inside a `bg-card` row, which
 * inverted the surface stack so all 198 selects read as holes punched through the table.
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
			// track, so all six selects come out one width instead of six widths set by how long
			// each facet's title happens to be.
			className={`${selectClass} h-8 w-full px-2 text-xs`}
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
	showActions,
	showFacets,
}: {
	onChange: (
		projectId: string,
		field: FacetField,
		value: ProjectAssuranceProfileInput[FacetField],
	) => void;
	onReset: (projectId: string) => void;
	onSave: (projectId: string) => void;
	row: ProfileMatrixRowModel;
	/** Matches the header: the Actions column only exists when some row can act. */
	showActions: boolean;
	/** Matches the header: the facet selects only exist in the page's edit-facets mode. */
	showFacets: boolean;
}) {
	const auditCount = row.preview?.audits.length ?? 0;
	const applicable = row.preview?.audits.filter((audit) => audit.applies).length ?? 0;
	const required = row.preview?.audits.filter((audit) => audit.effect === 'required').length ?? 0;

	return (
		// A dirty row is promoted at row level, not just by a 40px badge: over a 3000px table the
		// badge scrolled out of reach and the header count was the only other signal. The tint plus
		// the amber rule on the pinned cell make the row findable from the sticky column alone.
		<tr
			className={`border-b border-border align-top transition-colors hover:bg-muted/40 ${
				row.dirty ? toneSurface.amber : ''
			}`}
			data-dirty={row.dirty ? 'true' : undefined}>
			<th
				className={`sticky left-0 z-10 max-w-64 min-w-44 bg-card px-3 py-3 text-left ${pinnedLeftEdgeClass} ${
					row.dirty ? `border-l-2 ${toneBorder.amber}` : ''
				}`}>
				<Link
					className="block truncate text-sm font-semibold text-foreground hover:underline"
					to={`/projects/${encodeURIComponent(row.project.routeId)}?tab=profile`}>
					{row.project.name}
				</Link>
				<FilePath
					className="mt-1 block truncate text-2xs text-muted-foreground"
					path={row.project.path}
				/>
			</th>
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
			{showFacets
				? profileFacets.map((facet) => (
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
				{/* `items-start`: the column stretched its Badge into a 160px bar while the Source
				    Badge two cells earlier stayed an intrinsic pill — one component, two shapes. */}
				<div className="flex min-w-40 flex-col items-start gap-1">
					<Badge tone="neutral">{row.posture.label}</Badge>
					{row.posture.reasons.length > 0 && (
						<span className="text-xs text-muted-foreground">
							{row.posture.reasons.length} hardening trigger
							{row.posture.reasons.length === 1 ? '' : 's'}
						</span>
					)}
				</div>
			</td>
			{/* `whitespace-nowrap`: at 69px both lines wrapped, making this the tallest cell in
			    every row and setting an 89px row height across the whole table. */}
			<td className="min-w-28 px-3 py-3 text-xs whitespace-nowrap tabular-nums">
				<div className="font-medium text-foreground">
					{applicable}/{auditCount} apply
				</div>
				<div className="text-muted-foreground">{required} required</div>
			</td>
			<td className="px-3 py-3 text-xs whitespace-nowrap text-muted-foreground">
				{formatUpdatedAt(row.project.metadata.profile.updatedAt)}
			</td>
			{/* Pinned to the trailing edge so the commit controls stay reachable while the facet
			    selects scroll between the two pinned columns. A clean row keeps the cell — the
			    column has to stay rectangular — but renders nothing in it rather than two controls
			    that cannot be pressed. */}
			{showActions ? (
				<td className={`sticky right-0 z-10 bg-card px-3 py-3 ${pinnedRightEdgeClass}`}>
					{row.dirty ? (
						<div className="flex min-w-32 items-center gap-2">
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
					) : (
						<div className="min-w-32" />
					)}
				</td>
			) : null}
		</tr>
	);
}
