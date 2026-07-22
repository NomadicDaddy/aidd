import type { ProjectAuditEntry } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
import { bandTone, describeChangePotential, overrideEffects } from '../../audits/auditsUtils.ts';
import {
	describeFreshAge,
	describeReportFreshness,
	stateBadge,
	type OverrideValue,
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
		<Card className="hidden overflow-x-auto p-0 md:block">
			<table aria-label="Project audits" className="w-full min-w-[960px] text-left text-sm">
				<thead className="border-b bg-neutral-50 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-900">
					<tr>
						<th className="px-3 py-3" scope="col">
							<input
								aria-label="Select all audits"
								checked={allSelected}
								disabled={selectableNames.length === 0}
								onChange={handleHeaderCheckbox}
								ref={(el) => {
									if (el) el.indeterminate = someSelected && !allSelected;
								}}
								type="checkbox"
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
								className="px-3 py-6 text-center text-sm text-neutral-500"
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
							<tr
								className="border-b last:border-0 dark:border-neutral-800"
								key={entry.name}>
								<td className="px-3 py-3">
									<input
										aria-label={`Select ${entry.name}`}
										checked={selected.includes(entry.name)}
										disabled={!entry.enabled || !auditsEnabled}
										onChange={() => onToggleSelected(entry.name)}
										type="checkbox"
									/>
								</td>
								<td className="px-3 py-3">
									<div className="font-medium text-neutral-950 dark:text-neutral-50">
										{entry.name}
									</div>
									<div className="text-xs break-all text-neutral-500">
										{entry.path}
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
											<span className="text-xs text-neutral-500">
												{entry.changePotential.score}
											</span>
										</span>
									) : (
										<span className="text-xs text-neutral-400">—</span>
									)}
								</td>
								<td className="px-3 py-3 text-xs">
									{entry.freshReport ? (
										<span
											className="inline-flex items-center gap-1.5"
											title={freshAge}>
											<Badge tone="emerald">Fresh</Badge>
											{freshAge && (
												<span className="text-neutral-500">{freshAge}</span>
											)}
										</span>
									) : entry.staleReport ? (
										<span title={describeReportFreshness(entry)}>
											<Badge tone="amber">Stale</Badge>
										</span>
									) : entry.missingReport ? (
										<Badge tone="red">Missing</Badge>
									) : (
										<span className="text-neutral-400">—</span>
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
												event.target.value as OverrideValue
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
