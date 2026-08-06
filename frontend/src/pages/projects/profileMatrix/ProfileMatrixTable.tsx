import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type {
	ProfileMatrixRowModel,
	ProfileMatrixSortDir,
	ProfileMatrixSortKey,
} from './profileMatrixTypes.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { SortableColumnHeader } from '../../../components/shared/SortableColumnHeader.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { pinnedLeftEdgeClass, pinnedRightEdgeClass } from '../../../lib/tableStyles.ts';
import { profileFacets } from '../detail/profile/profile-facets.ts';
import { ProfileMatrixRow } from './ProfileMatrixRow.tsx';

// Sticky in both axes: `top-0` keeps the header on screen down a table that is taller than the
// scrollport, and the leading cell adds `left-0` so a row stays identifiable while the six facet
// selects are scrolled through in edit mode.
const headerCellClass = 'sticky top-0 z-20 bg-muted px-3 py-3';

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
	// The resting Summary view has no editable control on screen, so a Save and a reset per row were
	// 66 permanently-disabled controls in a pinned 152px column that could never do anything. The
	// column exists while editing — where it is about to be needed — and while anything is unsaved,
	// so switching back to Summary with pending edits does not strand them. Within the column a row
	// renders controls only when it is dirty, so the disabled state never appears at all.
	const showActions = showFacets || rows.some((row) => row.dirty);

	return (
		// Hidden below `md`, where ProfileMatrixMobileList renders the same rows as stacked cards.
		<Card className="hidden p-0 md:block">
			<OverflowScroller
				ariaLabel="Project profile matrix"
				scrollerClassName="max-h-[70vh] overflow-y-auto">
				<table aria-label="Project profile matrix" className="w-full text-left text-sm">
					<thead className="border-b border-border text-xs text-muted-foreground uppercase">
						<tr>
							<SortableColumnHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className={`${headerCellClass} left-0 z-30 ${pinnedLeftEdgeClass}`}
								label="Project"
								onSort={onSort}
								sortKey="project"
							/>
							<SortableColumnHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className={headerCellClass}
								label="Source"
								onSort={onSort}
								sortKey="source"
							/>
							{showFacets
								? profileFacets.map((facet) => (
										<SortableColumnHeader
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
							<SortableColumnHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className={headerCellClass}
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
							{showActions ? (
								<th
									className={`${headerCellClass} right-0 z-30 ${pinnedRightEdgeClass}`}
									scope="col">
									Actions
								</th>
							) : null}
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
								showActions={showActions}
								showFacets={showFacets}
							/>
						))}
					</tbody>
				</table>
			</OverflowScroller>
		</Card>
	);
}
