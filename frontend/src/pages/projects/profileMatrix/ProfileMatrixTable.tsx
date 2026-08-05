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

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { profileFacets } from '../detail/profile/profile-facets.ts';
import { ProfileMatrixRow } from './ProfileMatrixRow.tsx';

// Sticky in both axes: `top-0` keeps the header on screen down a table that is taller than the
// scrollport, and the leading cell adds `left-0` so a row stays identifiable while the six facet
// selects are scrolled through in edit mode.
const headerCellClass = 'sticky top-0 z-20 bg-muted px-3 py-3';

function SortHeader({
	activeDir,
	activeKey,
	className = headerCellClass,
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
				className={`inline-flex items-center gap-1 text-left whitespace-nowrap uppercase ${
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

/**
 * The matrix defaults to a read-only summary: who the project is, where its profile came from, what
 * posture that produces and which audits it turns on. The six facet selects that produce the
 * posture are what make the table 1900px wide, and they are only useful while actually editing, so
 * `showFacets` gates them behind the page's explicit edit mode.
 */
export function ProfileMatrixTable({
	activeSortDir,
	activeSortKey,
	isPreviewing,
	onChange,
	onReset,
	onSave,
	onSort,
	rows,
	showFacets,
}: {
	activeSortDir: ProfileMatrixSortDir;
	activeSortKey: ProfileMatrixSortKey;
	isPreviewing: boolean;
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
}) {
	return (
		// Hidden below `md`, where ProfileMatrixMobileList renders the same rows as stacked cards.
		<Card className="hidden p-0 md:block">
			<OverflowScroller
				ariaLabel="Project profile matrix"
				scrollerClassName="max-h-[70vh] overflow-y-auto">
				<table aria-label="Project profile matrix" className="w-full text-left text-sm">
					<thead className="border-b border-border text-xs text-muted-foreground uppercase">
						<tr>
							<SortHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className={`${headerCellClass} left-0 z-30`}
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
							{showFacets
								? profileFacets.map((facet) => (
										<SortHeader
											activeDir={activeSortDir}
											activeKey={activeSortKey}
											className="sticky top-0 z-20 min-w-40 bg-muted px-2 py-3"
											key={facet.field}
											label={facet.title}
											onSort={onSort}
											sortKey={facet.field}
										/>
									))
								: null}
							<SortHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								label="Posture"
								onSort={onSort}
								sortKey="posture"
							/>
							<th className={headerCellClass} scope="col">
								Audits
								{isPreviewing && (
									<span className="ml-1 font-normal text-muted-foreground lowercase">
										recalc
									</span>
								)}
							</th>
							<th className={headerCellClass} scope="col">
								Updated
							</th>
							<th
								className={`${headerCellClass} right-0 z-30 shadow-[inset_-8px_0_8px_-8px_rgba(0,0,0,0.35)]`}
								scope="col">
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
								showFacets={showFacets}
							/>
						))}
					</tbody>
				</table>
			</OverflowScroller>
		</Card>
	);
}
