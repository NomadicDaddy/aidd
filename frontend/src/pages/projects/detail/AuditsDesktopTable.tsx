import type { ProjectAuditEntry } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
import { tableHeadClass, tableMeasureClass } from '../../../lib/tableStyles.ts';
import { bandTone, describeChangePotential, overrideEffects } from '../../audits/auditsUtils.ts';
import {
	auditPathTail,
	describeFreshAge,
	describeReportFreshness,
	type OverrideValue,
	stateBadge,
} from './auditsTabUtils.tsx';

export function AuditsDesktopTable({
	auditsEnabled,
	changeOverride,
	launchPending,
	onClearAll,
	onSelectAll,
	onToggleSelected,
	rows,
	runSingle,
	selectableNames,
	selected,
	updateOverridesPending,
}: {
	auditsEnabled: boolean;
	changeOverride: (name: string, value: OverrideValue) => void;
	launchPending: boolean;
	onClearAll: () => void;
	onSelectAll: () => void;
	onToggleSelected: (name: string) => void;
	rows: ProjectAuditEntry[];
	runSingle: (name: string, review: boolean) => void;
	selectableNames: string[];
	selected: string[];
	updateOverridesPending: boolean;
}) {
	const allSelected =
		selectableNames.length > 0 && selectableNames.every((n) => selected.includes(n));
	const someSelected = selectableNames.some((n) => selected.includes(n));

	function handleHeaderCheckbox() {
		if (allSelected) onClearAll();
		else onSelectAll();
	}
	return (
		// The header only sticks against the scroll container that actually scrolls, and the
		// Card was one (overflow-x-auto computes overflow-y to auto) while never scrolling
		// vertically — so 'sticky top-0' would have been inert. Bounding the Card's height makes it
		// the real scroller: past the first screenful of 42 rows the six columns keep their labels.
		<Card className="hidden max-h-[calc(100dvh-14rem)] overflow-auto p-0 xl:block">
			<table
				aria-label="Project audits"
				className={`w-full min-w-[960px] text-left text-sm ${tableMeasureClass}`}>
				<thead className={`${tableHeadClass} sticky top-0 z-10`}>
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
						<th className="px-3 py-3" scope="col">
							Audit
						</th>
						<th className="px-3 py-3" scope="col">
							State
						</th>
						<th className="px-3 py-3" scope="col">
							Change Potential
						</th>
						<th className="px-3 py-3" scope="col">
							Report
						</th>
						<th className="px-3 py-3" scope="col">
							Override
						</th>
						<th className="px-3 py-3 text-right" scope="col">
							Actions
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td
								className="px-3 py-6 text-center text-sm text-muted-foreground"
								colSpan={7}>
								No audits match the current filters.
							</td>
						</tr>
					) : null}
					{rows.map((entry) => {
						const overrideValue: OverrideValue = entry.overrideEffect ?? 'default';
						const rowDisabled = !auditsEnabled || !entry.enabled;
						const rowTooltip = !auditsEnabled
							? 'Audits are globally disabled.'
							: !entry.enabled
								? 'This audit is disabled for the project.'
								: undefined;
						const freshAge = entry.freshReport ? describeFreshAge(entry) : undefined;
						return (
							<tr className="border-b border-border last:border-0" key={entry.name}>
								<td className="px-3 py-3">
									<Checkbox
										aria-label={`Select ${entry.name}`}
										checked={selected.includes(entry.name)}
										disabled={!entry.enabled || !auditsEnabled}
										onChange={() => onToggleSelected(entry.name)}
									/>
								</td>
								<td className="px-3 py-3">
									<div className="font-medium text-foreground">{entry.name}</div>
									{/* The repo-relative tail, not the absolute path: the first 28
									    characters were identical on all 42 rows and the last segment
									    repeated the name above it, wrapping to a second line on the
									    longer ones and inflating those rows. */}
									<div
										className="truncate font-mono text-xs text-muted-foreground"
										title={entry.path}>
										{auditPathTail(entry.path)}
									</div>
								</td>
								<td className="px-3 py-3">{stateBadge(entry)}</td>
								<td className="px-3 py-3">
									{entry.changePotential ? (
										<span
											className="inline-flex items-center gap-2"
											title={describeChangePotential(entry.changePotential)}>
											<Badge tone={bandTone[entry.changePotential.band]}>
												{entry.changePotential.band}
											</Badge>
											{/* A quantity, right-aligned in a fixed cell so the
											    digits line up down 42 rows. */}
											<span className="w-7 text-right text-xs text-muted-foreground tabular-nums">
												{entry.changePotential.score}
											</span>
										</span>
									) : (
										<span className="text-xs text-muted-foreground">—</span>
									)}
								</td>
								<td className="px-3 py-3 text-xs">
									{entry.freshReport ? (
										<span
											className="inline-flex items-center gap-1.5"
											title={freshAge}>
											<Badge tone="emerald">Fresh</Badge>
											{freshAge && (
												<span className="text-muted-foreground">
													{freshAge}
												</span>
											)}
										</span>
									) : entry.staleReport ? (
										<span title={describeReportFreshness(entry)}>
											<Badge tone="amber">Stale</Badge>
										</span>
									) : entry.missingReport ? (
										<Badge tone="red">Missing</Badge>
									) : (
										<span className="text-muted-foreground">—</span>
									)}
								</td>
								<td className="px-3 py-3">
									<select
										aria-label={`Override for ${entry.name}`}
										className={`${selectClass} w-full`}
										disabled={updateOverridesPending}
										onChange={(event) =>
											changeOverride(
												entry.name,
												event.target.value as OverrideValue,
											)
										}
										value={overrideValue}>
										{overrideEffects.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</td>
								<td className="px-3 py-3">
									<div className="flex justify-end gap-2">
										<Button
											disabled={rowDisabled || launchPending}
											onClick={() => runSingle(entry.name, false)}
											title={rowTooltip}
											variant="secondary">
											Run
										</Button>
										<Button
											disabled={rowDisabled || launchPending}
											onClick={() => runSingle(entry.name, true)}
											title={rowTooltip}
											variant="secondary">
											Review
										</Button>
									</div>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</Card>
	);
}
