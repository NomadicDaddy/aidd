import type { AuditDefinition } from '../../../api/types.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import {
	auditFileName,
	bandTone,
	bucketsColumnLabel,
	describeChangePotential,
	reportsColumnLabel,
} from '../auditsUtils.ts';
import { CatalogCards } from './CatalogCards.tsx';
import { ReportCounts } from './catalogCells.tsx';

interface CatalogTableProps {
	allSelected: boolean;
	definitions: AuditDefinition[];
	onClearAll: () => void;
	onJumpToMatrix: () => void;
	onSelect: (name: string) => void;
	onSelectAll: () => void;
	onToggleSelected: (name: string) => void;
	selectedAudit: null | string;
	selectedAuditNames: string[];
	someSelected: boolean;
}

// Every numeric column is right-aligned, so the digits line up against the column edge instead of
// against whatever width the value beside them happened to take.
const numericCell = 'px-3 py-3 text-right';
const numericHead = 'bg-muted px-3 py-3 text-right';

export function CatalogTable({
	allSelected,
	definitions,
	onClearAll,
	onJumpToMatrix,
	onSelect,
	onSelectAll,
	onToggleSelected,
	selectedAudit,
	selectedAuditNames,
	someSelected,
}: CatalogTableProps) {
	function handleHeaderCheckbox() {
		if (allSelected) onClearAll();
		else onSelectAll();
	}
	const hasSelectableDefinitions = definitions.some((item) => item.enabled);
	return (
		<div className="space-y-3">
			{/* The cap goes on the scroller, not on the Card — which is where its two sibling tabs
			    put it, because neither of them wraps its table in an `OverflowScroller`. A sticky
			    head sticks inside its nearest scrolling ancestor, and this table already has one:
			    the scroller scrolls horizontally, which makes it a scroll container in both. Capping
			    the Card instead would leave the head stuck to a box that never scrolls, and all 42
			    audits would still read their numbers with no column labels on screen. */}
			<Card className="hidden p-0 xl:block">
				<OverflowScroller
					ariaLabel="Audit catalog"
					scrollerClassName="max-h-[calc(100dvh-16rem)]">
					<table
						aria-label="Audit catalog"
						className="w-full min-w-[900px] text-left text-sm">
						{/* `bg-muted` on each cell, not only on the `thead`: a sticky `<thead>` in a
						    table does not reliably paint its own background, so the rows would scroll
						    through the labels. Same fix as the applicability matrix. */}
						<thead className={`${tableHeadClass} sticky top-0 z-10`}>
							<tr>
								<th className="bg-muted px-3 py-3" scope="col">
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
								<th className="bg-muted px-3 py-3" scope="col">
									Audit
								</th>
								<th className="bg-muted px-3 py-3" scope="col">
									Change Potential
								</th>
								{/* The score used to sit inline after a variable-width band badge, so
								    it started at a different x on every row and never formed a column
								    despite carrying `tabular-nums`. It is a column now. */}
								<th className={numericHead} scope="col">
									Score
								</th>
								<th className={numericHead} scope="col">
									Applicable Projects
								</th>
								<th className={numericHead} scope="col">
									{reportsColumnLabel}
								</th>
								<th className={numericHead} scope="col">
									{bucketsColumnLabel}
								</th>
							</tr>
						</thead>
						<tbody>
							{definitions.map((item) => (
								<tr
									className={`cursor-pointer border-b border-border last:border-0 ${selectedAudit === item.name ? 'bg-accent-muted text-accent-muted-foreground' : 'hover:bg-muted/60'}`}
									key={item.name}
									onClick={() => onSelect(item.name)}>
									<td className="px-3 py-3">
										<Checkbox
											aria-label={`Select ${item.name} for launch`}
											checked={selectedAuditNames.includes(item.name)}
											disabled={!item.enabled}
											onChange={() => onToggleSelected(item.name)}
											onClick={(event) => event.stopPropagation()}
										/>
									</td>
									<td className="px-3 py-3">
										<div
											className="max-w-[18rem] truncate font-medium text-foreground"
											title={item.name}>
											{item.name}
										</div>
										<div
											className="max-w-[18rem] truncate text-xs text-muted-foreground"
											title={item.path}>
											{auditFileName(item.path)}
										</div>
									</td>
									<td className="px-3 py-3">
										{item.changePotential ? (
											<Badge tone={bandTone[item.changePotential.band]}>
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
												className="tabular-nums"
												title={describeChangePotential(
													item.changePotential,
												)}>
												{item.changePotential.score}
											</span>
										) : (
											<span className="text-xs text-muted-foreground">—</span>
										)}
									</td>
									<td className={`${numericCell} tabular-nums`}>
										{item.applicableProjectCount}
									</td>
									<td className={numericCell}>
										<ReportCounts definition={item} />
									</td>
									<td className={`${numericCell} text-xs`}>
										<button
											className="text-accent tabular-nums hover:underline"
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
