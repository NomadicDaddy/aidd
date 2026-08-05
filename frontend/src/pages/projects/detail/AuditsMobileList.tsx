import type { ProjectAuditEntry } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
import { bandTone, describeChangePotential, overrideEffects } from '../../audits/auditsUtils.ts';
import {
	describeFreshAge,
	describeReportFreshness,
	type OverrideValue,
	stateBadge,
} from './auditsTabUtils.tsx';

export function AuditsMobileList({
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
	return (
		<div className="space-y-2 xl:hidden">
			{rows.length > 0 && selectableNames.length > 0 ? (
				<div className="flex justify-end">
					<Button
						disabled={!auditsEnabled}
						onClick={allSelected ? onClearAll : onSelectAll}
						size="compact"
						variant="secondary">
						{allSelected ? 'Unselect All' : 'Select All'}
					</Button>
				</div>
			) : null}
			{rows.length === 0 ? (
				<Card className="text-center text-sm text-muted-foreground">
					No audits match the current filters.
				</Card>
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
					<div className="rounded-md border border-border p-3" key={entry.name}>
						<div className="flex items-start justify-between gap-2">
							<label className="flex min-w-0 items-start gap-2">
								<input
									aria-label={`Select ${entry.name}`}
									checked={selected.includes(entry.name)}
									className="mt-1"
									disabled={!entry.enabled || !auditsEnabled}
									onChange={() => onToggleSelected(entry.name)}
									type="checkbox"
								/>
								<span className="min-w-0">
									<span className="block font-medium text-foreground">
										{entry.name}
									</span>
									<span className="block text-xs break-all text-muted-foreground">
										{entry.path}
									</span>
								</span>
							</label>
							{stateBadge(entry)}
						</div>
						<dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
							<div className="space-y-1">
								<dt className="font-medium text-muted-foreground uppercase">
									Change Potential
								</dt>
								<dd>
									{entry.changePotential ? (
										<span
											className="inline-flex items-center gap-2"
											title={describeChangePotential(entry.changePotential)}>
											<Badge tone={bandTone[entry.changePotential.band]}>
												{entry.changePotential.band}
											</Badge>
											<span className="text-muted-foreground">
												{entry.changePotential.score}
											</span>
										</span>
									) : (
										<span className="text-muted-foreground">—</span>
									)}
								</dd>
							</div>
							<div className="space-y-1">
								<dt className="font-medium text-muted-foreground uppercase">
									Report
								</dt>
								<dd>
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
								</dd>
							</div>
							<div className="col-span-2 space-y-1">
								<dt className="font-medium text-muted-foreground uppercase">
									Override
								</dt>
								<dd>
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
								</dd>
							</div>
						</dl>
						<div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
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
					</div>
				);
			})}
		</div>
	);
}
