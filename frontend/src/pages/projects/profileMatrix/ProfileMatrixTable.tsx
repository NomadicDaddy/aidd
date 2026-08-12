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
	// Gated on unsaved work alone, not on edit mode. A right-pinned column overlays whatever is
	// beneath it at every scroll position short of the extreme — measured at scrollLeft 0 the empty
	// 152px Actions column covered 61px of every Release artifacts select, so the header read
	// "RELEASE ARTIF" and a value read "Binary archiv" with its chevron behind a blank strip. That is
	// the price of pinning, and it is only worth paying once the column has something to hold:
	// entering edit mode mounts it before anything can be committed to it, and the bulk path is
	// already covered by Save all changed in the page header. It re-mounts on the first edit.
	const showActions = rows.some((row) => row.dirty);
	// Fixed widths only where the layout is fixed. In Summary the table is five columns of `w-full`,
	// and `auto` split 1960px evenly into four gutters: the Source cell was 356px around a 62px
	// badge and Posture 423px around a ~100px one, so the eye travelled ~1200px from a project's
	// name to its timestamp. Pinning the four trailing columns near their intrinsic widths sends the
	// surplus to the identity column, which is the one that can use it. In Edit facets the table has
	// to overflow to 2629px, and a fixed layout is exactly what would stop it.
	const summaryWidth = (width: string) => (showFacets ? '' : width);

	return (
		// Hidden below `md`, where ProfileMatrixMobileList renders the same rows as stacked cards.
		// Summary stops at the same 80rem measure as the toolbar so its fixed outcome columns stay
		// beside project identity on wide screens. Edit facets keeps the full canvas for its scroller.
		<Card className={`hidden p-0 xl:block ${showFacets ? '' : 'max-w-[80rem]'}`}>
			{/* `calc(100dvh-16rem)`, not `70vh`: the Audits tables next door subtract the chrome
			    they actually sit under instead of taking a fraction of the window, and a fraction
			    gets less accurate the taller the screen — at 1309px `70vh` left 393px of unused
			    page below the scrollport, roughly two more projects' worth. */}
			<OverflowScroller
				ariaLabel="Project profile matrix"
				scrollerClassName="max-h-[calc(100dvh-16rem)] overflow-y-auto">
				<table
					aria-label="Project profile matrix"
					className={`w-full text-left text-sm ${showFacets ? '' : 'table-fixed'}`}>
					<thead className="border-b border-border text-xs text-muted-foreground uppercase">
						{/* Posture and Audits lead the facet block, and Source trails it. Edit facets
						    makes the table 2629px inside a 1960px scrollport, and the three columns it
						    used to push off the right edge were the ones showing the *result* of an
						    edit: change Data sensitivity and the recomputed posture, the audit counts
						    and the header's own "recalc" hint were 669px away behind a horizontal
						    scroll. Cause and effect share the scrollport now, and the trailing slot
						    goes to Source, a static Explicit/Inferred badge that cannot change while
						    editing. The order is the same in both modes so nothing moves under the
						    cursor when the mode toggles; the Unsaved badge travels with Source, which
						    the row tint and the amber rule on the pinned cell already cover. */}
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
								className={`${headerCellClass} ${summaryWidth('w-50')}`}
								label="Posture"
								onSort={onSort}
								sortKey="posture"
							/>
							<SortableColumnHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className={`${headerCellClass} ${summaryWidth('w-35')}`}
								hint={
									isPreviewing ? (
										<span className="ml-1 font-normal text-muted-foreground lowercase">
											recalc
										</span>
									) : null
								}
								label="Audits"
								onSort={onSort}
								sortKey="audits"
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
								className={`${headerCellClass} ${summaryWidth('w-40')}`}
								label="Source"
								onSort={onSort}
								sortKey="source"
							/>
							<SortableColumnHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className={`${headerCellClass} ${summaryWidth('w-45')}`}
								label="Updated"
								onSort={onSort}
								sortKey="updated"
							/>
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
