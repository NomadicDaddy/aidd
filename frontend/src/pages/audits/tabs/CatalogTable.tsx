import type { AuditDefinition } from '../../../api/types.ts';
import type { FilterRegister } from '../../../lib/filterFields.ts';
import type { CatalogSort, CatalogSortKey } from '../catalogSort.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { FilePath } from '../../../components/shared/FilePath.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { SortableColumnHeader } from '../../../components/shared/SortableColumnHeader.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import {
	contentSizedColumnClass,
	contentSizedTableClass,
	tableHeadClass,
} from '../../../lib/tableStyles.ts';
import { toneText } from '../../../lib/tones.ts';
import {
	auditCatalogCardId,
	auditFileName,
	bucketsColumnLabel,
	describeChangePotential,
	reportsColumnLabel,
} from '../auditsUtils.ts';
import { CatalogCards } from './CatalogCards.tsx';
import { CatalogOutcomeCells, CatalogOutcomeHeaders, ReportCounts } from './catalogCells.tsx';

interface CatalogTableProps {
	allSelected: boolean;
	definitions: AuditDefinition[];
	/** The filters that narrowed the catalog to nothing, when any are in force. */
	filters: FilterRegister | undefined;
	onClearAll: () => void;
	onJumpToMatrix: () => void;
	onSelect: (name: string) => void;
	onSelectAll: () => void;
	onSort: (key: CatalogSortKey) => void;
	onToggleSelected: (name: string) => void;
	selectedAudit: null | string;
	selectedAuditNames: string[];
	someSelected: boolean;
	sort: CatalogSort;
}

// Every numeric column is right-aligned, so the digits line up against the column edge instead of
// against whatever width the value beside them happened to take.
const compactCell = `${contentSizedColumnClass} px-3 py-3`;
const compactHead = `${contentSizedColumnClass} bg-muted px-3 py-3`;
const numericCell = `${contentSizedColumnClass} px-3 py-3 text-right`;
const numericHead = `${contentSizedColumnClass} bg-muted px-3 py-3 text-right`;

export function CatalogTable({
	allSelected,
	definitions,
	filters,
	onClearAll,
	onJumpToMatrix,
	onSelect,
	onSelectAll,
	onSort,
	onToggleSelected,
	selectedAudit,
	selectedAuditNames,
	someSelected,
	sort,
}: CatalogTableProps) {
	function handleHeaderCheckbox() {
		if (allSelected) onClearAll();
		else onSelectAll();
	}
	const hasSelectableDefinitions = definitions.some((item) => item.enabled);
	// One empty state for both presentations, drawn ahead of the table rather than as a bare row
	// under ten column labels here and a centred sentence in the card list below.
	if (definitions.length === 0) {
		return (
			<EmptyState filterReset="toolbar" filters={filters}>
				{filters === undefined
					? 'No audit definitions are available.'
					: 'No audits match the current filters.'}
			</EmptyState>
		);
	}
	return (
		<div className="space-y-3">
			{/* The catalog stays in page flow. A nested vertical scrollport left only six rows visible
			    at common laptop heights while the page itself still scrolled; horizontal overflow is
			    retained only when the columns genuinely cannot fit. */}
			<Card className="hidden p-0 xl:block">
				<OverflowScroller
					ariaLabel="Audit catalog"
					scrollerClassName="group-data-[overflow-start=false]:group-data-[overflow-end=false]:overflow-visible">
					<table
						aria-label="Audit catalog"
						className={`${contentSizedTableClass} min-w-[1120px]`}>
						{/* `bg-muted` on each cell, not only on the `thead`: a sticky `<thead>` in a
						    table does not reliably paint its own background, so the rows would scroll
						    through the labels. Same fix as the applicability matrix. */}
						<thead className={tableHeadClass}>
							<tr>
								<th className={compactHead} scope="col">
									<Checkbox
										aria-label="Select all visible enabled audits"
										checked={allSelected}
										disabled={!hasSelectableDefinitions}
										onChange={handleHeaderCheckbox}
										ref={(el) => {
											if (el) el.indeterminate = someSelected && !allSelected;
										}}
									/>
								</th>
								<SortableColumnHeader
									activeDir={sort.dir}
									activeKey={sort.key}
									className="bg-muted px-3 py-3"
									label="Audit"
									onSort={onSort}
									sortKey="name"
								/>
								<SortableColumnHeader
									activeDir={sort.dir}
									activeKey={sort.key}
									className={`${compactHead} whitespace-nowrap`}
									// The band is the score, so pressing it sorts by score; the numeric column
									// beside it is the one that shows which way.
									indicatesSort={false}
									label="Change Potential"
									onSort={onSort}
									sortKey="score"
								/>
								{/* The score is a column of its own. Inline after a variable-width band
								    badge it would start at a different x on every row and never form
								    a column despite carrying `tabular-nums`.

								    All seven numeric columns are `SortableColumnHeader`. The table is
								    sorted — score descending, visibly so — and the headers say so and
								    offer a way to change it, on the surface the baseline names as this
								    component's reference consumer. The header's own `<button>` is
								    what makes the affordance visible; the `text-right` cells put it
								    against the column edge the digits use, so the label still lines
								    up with the numbers below it. */}
								<SortableColumnHeader
									activeDir={sort.dir}
									activeKey={sort.key}
									className={numericHead}
									label="Score"
									onSort={onSort}
									sortKey="score"
								/>
								<CatalogOutcomeHeaders
									numericHead={numericHead}
									onSort={onSort}
									sort={sort}
								/>
								<SortableColumnHeader
									activeDir={sort.dir}
									activeKey={sort.key}
									className={numericHead}
									label="Applicable Projects"
									onSort={onSort}
									sortKey="projects"
								/>
								<SortableColumnHeader
									activeDir={sort.dir}
									activeKey={sort.key}
									className={numericHead}
									label={reportsColumnLabel}
									onSort={onSort}
									sortKey="reports"
								/>
								<SortableColumnHeader
									activeDir={sort.dir}
									activeKey={sort.key}
									className={numericHead}
									label={bucketsColumnLabel}
									onSort={onSort}
									sortKey="buckets"
								/>
							</tr>
						</thead>
						<tbody>
							{definitions.map((item) => (
								<tr
									className={`cursor-pointer border-b border-border last:border-0 ${selectedAudit === item.name ? 'bg-accent-muted text-accent-muted-foreground' : 'hover:bg-muted/60'}`}
									key={item.name}
									onClick={() => onSelect(item.name)}>
									<td className={compactCell}>
										<Checkbox
											aria-label={`Select ${item.name} for launch`}
											checked={selectedAuditNames.includes(item.name)}
											disabled={!item.enabled}
											onChange={() => onToggleSelected(item.name)}
											onClick={(event) => event.stopPropagation()}
										/>
									</td>
									<td className="px-3 py-3">
										{/* Both lines are machine strings — an audit id and the file it lives
										    in — and this table is the catalog reference other surfaces copy,
										    so it is where sans-rendered ids stop. The native button owns
										    keyboard activation; the row click remains a pointer shortcut. */}
										<button
											aria-label={`Open ${item.name} audit definition`}
											aria-pressed={selectedAudit === item.name}
											className="block rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
											id={`${auditCatalogCardId(item.name)}-table`}
											onClick={(event) => {
												event.stopPropagation();
												onSelect(item.name);
											}}
											type="button">
											<span
												className="block truncate font-mono font-medium text-foreground"
												title={item.name}>
												{item.name}
											</span>
											<FilePath
												className="block truncate text-xs text-muted-foreground"
												path={auditFileName(item.path)}
												title={item.path}
											/>
										</button>
									</td>
									<td className={compactCell}>
										{item.changePotential ? (
											<Badge tone="neutral">
												{item.changePotential.band}
											</Badge>
										) : (
											<span className="text-xs text-muted-foreground">—</span>
										)}
									</td>
									<td className={numericCell}>
										{item.changePotential ? (
											// The confidence reads the same on every visible row; it
											// stays in the tooltip with the rest of the evidence.
											<span
												className={`tabular-nums ${item.changePotential.band === 'High' ? toneText.teal : ''}`}
												title={describeChangePotential(
													item.changePotential,
												)}>
												{item.changePotential.score}
											</span>
										) : (
											<span className="text-xs text-muted-foreground">—</span>
										)}
									</td>
									<CatalogOutcomeCells
										definition={item}
										numericCell={numericCell}
									/>
									<td className={`${numericCell} tabular-nums`}>
										{item.applicableProjectCount}
									</td>
									<td className={numericCell}>
										<ReportCounts definition={item} />
									</td>
									{/* No `text-xs` here: this is the sixth right-aligned number in
									    the row and the other five inherit the table's 14px, so a size
									    step made it read as a footnote to the row rather than as a
									    column of it. The accent colour already marks it as the one
									    number you can click. */}
									<td className={numericCell}>
										<button
											aria-label={`View ${item.name} in the applicability matrix (${item.applicableBucketCount} of 7 buckets)`}
											className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-accent tabular-nums underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
											onClick={(event) => {
												event.stopPropagation();
												onJumpToMatrix();
											}}
											type="button">
											{item.applicableBucketCount}
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</OverflowScroller>
			</Card>

			<CatalogCards
				allSelected={allSelected}
				definitions={definitions}
				onClearAll={onClearAll}
				onJumpToMatrix={onJumpToMatrix}
				onSelect={onSelect}
				onSelectAll={onSelectAll}
				onToggleSelected={onToggleSelected}
				selectedAudit={selectedAudit}
				selectedAuditNames={selectedAuditNames}
			/>
		</div>
	);
}
