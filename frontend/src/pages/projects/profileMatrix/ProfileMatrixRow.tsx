import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { Link } from 'react-router-dom';

import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type { ProfileMatrixRowModel } from './profileMatrixTypes.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { profileFacets } from '../detail/profile/profile-facets.ts';

function formatUpdatedAt(value: string): string {
	if (!value) return 'Unknown';
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}

function ProfileFacetSelect({
	field,
	onChange,
	projectName,
	row,
}: {
	field: FacetField;
	onChange: (
		projectId: string,
		field: FacetField,
		value: ProjectAssuranceProfileInput[FacetField]
	) => void;
	projectName: string;
	row: ProfileMatrixRowModel;
}) {
	const facet = profileFacets.find((candidate) => candidate.field === field);
	if (!facet) return null;
	return (
		<select
			aria-label={`${projectName} ${facet.title}`}
			className="border-border bg-background text-foreground h-8 w-full min-w-36 rounded-md border px-2 text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
			onChange={(event) =>
				onChange(
					row.project.id,
					field,
					event.target.value as ProjectAssuranceProfileInput[FacetField]
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
}: {
	onChange: (
		projectId: string,
		field: FacetField,
		value: ProjectAssuranceProfileInput[FacetField]
	) => void;
	onReset: (projectId: string) => void;
	onSave: (projectId: string) => void;
	row: ProfileMatrixRowModel;
}) {
	const auditCount = row.preview?.audits.length ?? 0;
	const applicable = row.preview?.audits.filter((audit) => audit.applies).length ?? 0;
	const required = row.preview?.audits.filter((audit) => audit.effect === 'required').length ?? 0;
	const sourceTone = row.project.metadata.profile.source === 'explicit' ? 'cyan' : 'neutral';

	return (
		<tr className="border-border hover:bg-muted/40 border-b align-top transition-colors">
			<th className="bg-card sticky left-0 z-10 max-w-64 min-w-56 px-3 py-3 text-left">
				<Link
					className="text-foreground block truncate text-sm font-semibold hover:underline"
					to={`/projects/${encodeURIComponent(row.project.routeId)}?tab=profile`}>
					{row.project.name}
				</Link>
				<div className="text-muted-foreground mt-1 truncate font-mono text-[11px]">
					{row.project.path}
				</div>
			</th>
			<td className="px-3 py-3">
				<div className="flex flex-wrap gap-1.5">
					<Badge tone={sourceTone}>{row.project.metadata.profile.source}</Badge>
					{row.dirty && <Badge tone="amber">dirty</Badge>}
				</div>
			</td>
			{profileFacets.map((facet) => (
				<td className="px-2 py-3" key={facet.field}>
					<ProfileFacetSelect
						field={facet.field}
						onChange={onChange}
						projectName={row.project.name}
						row={row}
					/>
				</td>
			))}
			<td className="px-3 py-3">
				<div className="flex min-w-40 flex-col gap-1">
					<Badge tone={row.posture.tone}>{row.posture.label}</Badge>
					{row.posture.reasons.length > 0 && (
						<span className="text-muted-foreground text-xs">
							{row.posture.reasons.length} hardening trigger
							{row.posture.reasons.length === 1 ? '' : 's'}
						</span>
					)}
				</div>
			</td>
			<td className="px-3 py-3 text-xs tabular-nums">
				<div className="text-foreground font-medium">
					{applicable}/{auditCount} apply
				</div>
				<div className="text-muted-foreground">{required} required</div>
			</td>
			<td className="text-muted-foreground px-3 py-3 text-xs whitespace-nowrap">
				{formatUpdatedAt(row.project.metadata.profile.updatedAt)}
			</td>
			<td className="px-3 py-3">
				<div className="flex min-w-32 items-center gap-2">
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
			</td>
		</tr>
	);
}
