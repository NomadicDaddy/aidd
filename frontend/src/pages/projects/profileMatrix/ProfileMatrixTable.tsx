import { useState } from 'react';

import type { ProjectAssuranceProfileInput } from '../../../api/types.ts';
import type { FacetField } from '../detail/profile/profile-facets.ts';
import type {
	ProfileMatrixRowModel,
	ProfileMatrixSortDir,
	ProfileMatrixSortKey,
} from './profileMatrixTypes.ts';

import { ColumnChooser } from '../../../components/shared/ColumnChooser.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { SortableColumnHeader } from '../../../components/shared/SortableColumnHeader.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useViewportFill, viewportFillScrollerClass } from '../../../hooks/useViewportFill.ts';
import { cn } from '../../../lib/cn.ts';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import {
	contentSizedTableClass,
	pinnedLeftEdgeClass,
	tableHeadClass,
} from '../../../lib/tableStyles.ts';
import {
	defaultProfileFacetFields,
	isDefaultProfileFacetSelection,
	profileFacetColumnOptions,
	visibleProfileFacets,
} from './profileMatrixColumns.ts';
import { ProfileMatrixRow } from './ProfileMatrixRow.tsx';
import { useProfileMatrixNavigation } from './useProfileMatrixNavigation.ts';

// Sticky in both axes: `top-0` keeps the header on screen down a table that is taller than the
// scrollport, and the leading cell adds `left-0` so a row stays identifiable while the ten facet
// selects are scrolled through in edit mode.
const headerCellClass = 'sticky top-0 z-20 bg-muted px-3 py-3';
const profileProjectColumnClass = 'min-w-64';

/**
 * The matrix defaults to a read-only summary: who the project is, where its profile came from, what
 * posture that produces and which audits it turns on. The editable facet columns are only useful
 * while actually editing, so `showFacets` gates them behind the page's explicit edit mode and the
 * chooser defaults to the six exposure facets that can change posture.
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
	const [visibleFacetFields, setVisibleFacetFields] = useState(defaultProfileFacetFields);
	const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
	const visibleFacets = visibleProfileFacets(visibleFacetFields);
	const {
		activeFacet,
		revealFacet,
		scrollerRef,
		tableRef: tableElementRef,
	} = useProfileMatrixNavigation(visibleFacets);
	const tableRef = useViewportFill<HTMLDivElement>({
		gutterPx: 24,
		refreshKey: `${showFacets}:${[...visibleFacetFields].join(',')}`,
	});

	// Summary keeps the established 44-character identity measure as a preference, then lets its
	// outcome tracks share the remaining width at every desktop tier. This is not a cap: a longer
	// identity can still grow the auto-layout column. Edit mode stays fully content-sized so its
	// pinned identity width and measured scroll origin continue to agree.
	const summaryDataWidthClass = showFacets ? '' : 'w-auto';
	const summaryProjectWidthClass = showFacets ? '' : 'w-[44ch]';
	const snapClass = showFacets ? 'snap-start' : '';

	function toggleFacet(field: FacetField): void {
		if (visibleFacetFields.has(field) && activeSortKey === field) onSort('project');
		setVisibleFacetFields((current) => {
			const next = new Set(current);
			if (next.has(field)) next.delete(field);
			else next.add(field);
			return next;
		});
	}

	return (
		// Hidden below `md`, where ProfileMatrixMobileList renders the same rows as stacked cards.
		// Both modes inherit the page's full rail, so changing mode does not move the composition.
		<Card className="hidden p-0 xl:block">
			{showFacets ? (
				<nav
					aria-label="Profile matrix facet navigator"
					className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
					{hasHorizontalOverflow ? (
						<div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
							<span className={`mr-1 ${fieldLabelClass}`}>Jump to facet</span>
							{visibleFacets.map((facet) => (
								<Button
									aria-current={activeFacet === facet.field ? 'true' : undefined}
									aria-label={`Reveal ${facet.title} facet`}
									key={facet.field}
									onClick={() => revealFacet(facet)}
									size="compact"
									variant={activeFacet === facet.field ? 'secondary' : 'ghost'}>
									{facet.title}
								</Button>
							))}
						</div>
					) : (
						<span />
					)}
					<ColumnChooser
						isDefault={isDefaultProfileFacetSelection(visibleFacetFields)}
						label="Profile facets"
						onReset={() => setVisibleFacetFields(defaultProfileFacetFields())}
						onToggle={toggleFacet}
						options={profileFacetColumnOptions}
						selected={visibleFacetFields}
					/>
				</nav>
			) : null}
			{/* Measure below the optional facet navigator instead of maintaining two guessed viewport
			    subtrahends. Toggling modes moves this edge, so it is part of the refresh key. */}
			<OverflowScroller
				ariaLabel="Project profile matrix"
				onOverflowChange={(flags) => setHasHorizontalOverflow(flags.start || flags.end)}
				rootRef={tableRef}
				scrollerClassName={cn(
					viewportFillScrollerClass,
					showFacets && 'snap-x snap-mandatory',
				)}
				scrollerRef={scrollerRef}>
				<table
					aria-label="Project profile matrix"
					className={contentSizedTableClass}
					ref={tableElementRef}>
					<thead className={tableHeadClass}>
						{/* Posture and Audits lead the selected facet block, while Source and Updated
						    trail it. The outcome columns stay visible before the operator scrolls into
						    the inputs, and row actions remain with the pinned project identity. */}
						<tr>
							<SortableColumnHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className={cn(
									headerCellClass,
									profileProjectColumnClass,
									summaryProjectWidthClass,
									showFacets && `left-0 z-30 ${pinnedLeftEdgeClass}`,
								)}
								label="Project"
								onSort={onSort}
								sortKey="project"
							/>
							<SortableColumnHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className={`${headerCellClass} ${snapClass} ${summaryDataWidthClass}`}
								label="Posture"
								onSort={onSort}
								sortKey="posture"
							/>
							<SortableColumnHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className={`${headerCellClass} ${snapClass} ${summaryDataWidthClass}`}
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
								? visibleFacets.map((facet) => (
										<SortableColumnHeader
											activeDir={activeSortDir}
											activeKey={activeSortKey}
											className="sticky top-0 z-20 min-w-40 snap-start bg-muted px-2 py-3"
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
								className={`${headerCellClass} ${snapClass} ${summaryDataWidthClass}`}
								label="Source"
								onSort={onSort}
								sortKey="source"
							/>
							<SortableColumnHeader
								activeDir={activeSortDir}
								activeKey={activeSortKey}
								className={`${headerCellClass} ${snapClass} ${summaryDataWidthClass}`}
								label="Updated"
								onSort={onSort}
								sortKey="updated"
							/>
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
								visibleFacets={visibleFacets}
							/>
						))}
					</tbody>
				</table>
			</OverflowScroller>
		</Card>
	);
}
