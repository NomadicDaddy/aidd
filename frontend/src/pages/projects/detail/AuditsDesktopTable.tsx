import { Fragment, useState } from 'react';

import type { ProjectAuditEntry, ProjectFeature } from '../../../api/types.ts';
import type { FilterRegister } from '../../../lib/filterFields.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { SortableColumnHeader } from '../../../components/shared/SortableColumnHeader.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import { useViewportFill, viewportFillScrollerClass } from '../../../hooks/useViewportFill.ts';
import { quietSelectClass } from '../../../lib/formStyles.ts';
import { interactiveTableRowClass, tableHeadClass } from '../../../lib/tableStyles.ts';
import { overrideEffects } from '../../audits/auditsUtils.ts';
import {
	AuditActionButton,
	AuditChangePotential,
	AuditDetailsToggle,
	AuditFindingList,
	AuditPath,
	AuditReportState,
	AuditStateBadge,
} from './auditRowContent.tsx';
import {
	activeAuditFindings,
	type AuditSort,
	type AuditSortKey,
	type OverrideValue,
} from './auditsTabUtils.ts';
import { projectDetailViewportGutterPx } from './projectDetailViewport.ts';

export function AuditsDesktopTable({
	auditsEnabled,
	changeOverride,
	dismissPending,
	emptyFilters,
	features,
	launchPending,
	onClearAll,
	onDismiss,
	onSelectAll,
	onSort,
	onToggleSelected,
	rows,
	runSingle,
	selectableNames,
	selected,
	sort,
	updateOverridesPending,
}: {
	auditsEnabled: boolean;
	changeOverride: (name: string, value: OverrideValue) => void;
	dismissPending: boolean;
	/** The filters that narrowed the list to nothing, when any are in force. */
	emptyFilters: FilterRegister | undefined;
	features: ProjectFeature[];
	launchPending: boolean;
	onClearAll: () => void;
	onDismiss: (finding: ProjectFeature) => void;
	onSelectAll: () => void;
	onSort: (key: AuditSortKey) => void;
	onToggleSelected: (name: string) => void;
	rows: ProjectAuditEntry[];
	runSingle: (name: string, review: boolean) => void;
	selectableNames: string[];
	selected: string[];
	sort: AuditSort;
	updateOverridesPending: boolean;
}) {
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
	const tableRef = useViewportFill<HTMLDivElement>({
		gutterPx: projectDetailViewportGutterPx,
		refreshKey: rows,
	});
	const allSelected =
		selectableNames.length > 0 && selectableNames.every((n) => selected.includes(n));
	const someSelected = selectableNames.some((n) => selected.includes(n));

	function handleHeaderCheckbox() {
		if (allSelected) onClearAll();
		else onSelectAll();
	}
	if (rows.length === 0) {
		return (
			<EmptyState
				className="hidden @min-[60rem]:block"
				filterReset="toolbar"
				filters={emptyFilters}>
				No audits match the current filters.
			</EmptyState>
		);
	}
	return (
		// The height cap belongs to OverflowScroller's actual scrolling element so the sticky header,
		// keyboard region, and edge fades all describe the same bounded inventory.
		<div ref={tableRef}>
			<Card className="hidden p-0 @min-[60rem]:block">
				<OverflowScroller
					ariaLabel="Project audits"
					scrollerClassName={viewportFillScrollerClass}>
					<table
						aria-label="Project audits"
						className="w-full min-w-[960px] text-left text-sm">
						<thead className={tableHeadClass}>
							<tr>
								<th className="px-3 py-3" scope="col">
									<Checkbox
										aria-label="Select all audits"
										checked={allSelected}
										disabled={selectableNames.length === 0}
										onChange={handleHeaderCheckbox}
										ref={(el) => {
											if (el) el.indeterminate = someSelected && !allSelected;
										}}
									/>
								</th>
								<SortableColumnHeader
									activeDir={sort.direction}
									activeKey={sort.key}
									className="px-3 py-3"
									label="Audit"
									onSort={onSort}
									sortKey="audit"
								/>
								<SortableColumnHeader
									activeDir={sort.direction}
									activeKey={sort.key}
									className="px-3 py-3"
									label="State"
									onSort={onSort}
									sortKey="state"
								/>
								<SortableColumnHeader
									activeDir={sort.direction}
									activeKey={sort.key}
									className="px-3 py-3"
									label="Change Potential"
									onSort={onSort}
									sortKey="potential"
								/>
								<SortableColumnHeader
									activeDir={sort.direction}
									activeKey={sort.key}
									className="px-3 py-3"
									label="Report"
									onSort={onSort}
									sortKey="report"
								/>
								<th className="px-3 py-3" scope="col">
									Override
								</th>
								<th className="px-3 py-3 text-right" scope="col">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((entry) => {
								const overrideValue: OverrideValue =
									entry.overrideEffect ?? 'default';
								const rowTooltip = !auditsEnabled
									? 'Audits are globally disabled.'
									: !entry.enabled
										? 'This audit is disabled for the project.'
										: undefined;
								const findings = activeAuditFindings(features, entry.name);
								const isExpanded = expanded.has(entry.name);
								const detailsId = `project-audit-${entry.name.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}-details`;
								return (
									<Fragment key={entry.name}>
										<tr
											className={`group/quiet border-b border-border last:border-0 ${interactiveTableRowClass}`}>
											<td className="px-3 py-3">
												<Checkbox
													aria-label={`Select ${entry.name}`}
													checked={selected.includes(entry.name)}
													disabled={!entry.enabled || !auditsEnabled}
													onChange={() => onToggleSelected(entry.name)}
												/>
											</td>
											<td className="px-3 py-3">
												<div className="font-medium text-foreground">
													{entry.name}
												</div>
												{/* The repo-relative tail, not the absolute path: the first 28
									    characters were identical on all 42 rows and the last segment
									    repeated the name above it, wrapping to a second line on the
									    longer ones and inflating those rows. */}
												<AuditPath entry={entry} />
											</td>
											<td className="px-3 py-3">
												<AuditStateBadge entry={entry} />
											</td>
											<td className="px-3 py-3">
												<AuditChangePotential entry={entry} />
											</td>
											<td className="px-3 py-3 text-xs">
												<AuditReportState entry={entry} />
											</td>
											<td className="px-3 py-3">
												<select
													aria-label={`Override for ${entry.name}`}
													className={quietSelectClass}
													disabled={updateOverridesPending}
													onChange={(event) =>
														changeOverride(
															entry.name,
															event.target.value as OverrideValue,
														)
													}
													value={overrideValue}>
													{overrideEffects.map((option) => (
														<option
															key={option.value}
															value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</td>
											<td className="px-3 py-3">
												<div className="flex justify-end gap-2">
													<AuditDetailsToggle
														auditName={entry.name}
														detailsId={detailsId}
														expanded={isExpanded}
														findingCount={findings.length}
														onToggle={() =>
															setExpanded((current) => {
																const next = new Set(current);
																if (next.has(entry.name))
																	next.delete(entry.name);
																else next.add(entry.name);
																return next;
															})
														}
													/>
													<AuditActionButton
														auditName={entry.name}
														disabledReason={rowTooltip}
														label="Run"
														onClick={() => runSingle(entry.name, false)}
														pending={launchPending}
													/>
													<AuditActionButton
														auditName={entry.name}
														disabledReason={rowTooltip}
														label="Review"
														onClick={() => runSingle(entry.name, true)}
														pending={launchPending}
													/>
												</div>
											</td>
										</tr>
										{isExpanded ? (
											<tr className="border-b border-border" id={detailsId}>
												<td
													className="bg-muted py-3 pr-3 pl-12"
													colSpan={7}>
													<AuditFindingList
														auditName={entry.name}
														dismissPending={dismissPending}
														findings={findings}
														onDismiss={onDismiss}
													/>
												</td>
											</tr>
										) : null}
									</Fragment>
								);
							})}
						</tbody>
					</table>
				</OverflowScroller>
			</Card>
		</div>
	);
}
