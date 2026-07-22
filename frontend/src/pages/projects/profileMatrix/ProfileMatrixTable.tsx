import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { default as ArrowUpDown } from 'lucide-react/dist/esm/icons/arrow-up-down';

import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type {
	ProfileMatrixRowModel,
	ProfileMatrixSortDir,
	ProfileMatrixSortKey,
} from './profileMatrixTypes.ts';

import { Card } from '../../../components/ui/card.tsx';
import { profileFacets } from '../detail/profile/profile-facets.ts';
import { ProfileMatrixRow } from './ProfileMatrixRow.tsx';

function SortHeader({
	activeDir,
	activeKey,
	className = 'px-3 py-3',
	label,
	onSort,
	sortKey,
}: {
	activeDir: ProfileMatrixSortDir;
	activeKey: ProfileMatrixSortKey;
	className?: string;
	label: string;
	onSort: (key: ProfileMatrixSortKey) => void;
	sortKey: ProfileMatrixSortKey;
}) {
	const isActive = activeKey === sortKey;
	const Icon = isActive ? (activeDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
	return (
		<th
			aria-sort={isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none'}
			className={className}
			scope="col">
			<button
				aria-label={`Sort by ${label}${isActive ? ` (${activeDir})` : ''}`}
				className={`inline-flex items-center gap-1 text-left uppercase ${
					isActive ? 'text-foreground' : 'text-muted-foreground'
				}`}
				onClick={() => onSort(sortKey)}
				type="button">
				{label}
				<Icon aria-hidden="true" className="h-3 w-3" />
			</button>
		</th>
	);
}

export function ProfileMatrixTable({
	activeSortDir,
	activeSortKey,
	isPreviewing,
	onChange,
	onReset,
	onSave,
	onSort,
	rows,
}: {
	activeSortDir: ProfileMatrixSortDir;
	activeSortKey: ProfileMatrixSortKey;
	isPreviewing: boolean;
	onChange: (
		projectId: string,
		field: FacetField,
		value: ProjectAssuranceProfileInput[FacetField]
	) => void;
	onReset: (projectId: string) => void;
	onSave: (projectId: string) => void;
	onSort: (key: ProfileMatrixSortKey) => void;
	rows: ProfileMatrixRowModel[];
}) {
	return (
		<Card className="overflow-x-auto p-0">
			<table aria-label="Project profile matrix" className="w-full text-left text-sm">
				<thead className="border-border bg-muted/70 text-muted-foreground border-b text-xs uppercase">
					<tr>
						<SortHeader
							activeDir={activeSortDir}
							activeKey={activeSortKey}
							className="bg-muted sticky left-0 z-20 px-3 py-3"
							label="Project"
							onSort={onSort}
							sortKey="project"
						/>
						<SortHeader
							activeDir={activeSortDir}
							activeKey={activeSortKey}
							label="Source"
							onSort={onSort}
							sortKey="source"
						/>
						{profileFacets.map((facet) => (
							<SortHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className="min-w-40 px-2 py-3"
								key={facet.field}
								label={facet.title}
								onSort={onSort}
								sortKey={facet.field}
							/>
						))}
						<SortHeader
							activeDir={activeSortDir}
							activeKey={activeSortKey}
							label="Posture"
							onSort={onSort}
							sortKey="posture"
						/>
						<th className="px-3 py-3" scope="col">
							Audits
							{isPreviewing && (
								<span className="text-muted-foreground ml-1 font-normal lowercase">
									recalc
								</span>
							)}
						</th>
						<th className="px-3 py-3" scope="col">
							Updated
						</th>
						<th className="px-3 py-3" scope="col">
							Actions
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<ProfileMatrixRow
							key={row.project.id}
							onChange={onChange}
							onReset={onReset}
							onSave={onSave}
							row={row}
						/>
					))}
				</tbody>
			</table>
		</Card>
	);
}
