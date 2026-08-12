import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { useId } from 'react';

import type { ProjectAuditEntry } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
import { bandTone, describeChangePotential, overrideEffects } from '../../audits/auditsUtils.ts';
import {
	auditPathTail,
	describeFreshAge,
	describeReportFreshness,
	type OverrideValue,
	stateBadge,
} from './auditsTabUtils.tsx';

function ReportState({ entry }: { entry: ProjectAuditEntry }) {
	if (entry.freshReport) {
		return (
			<span className="inline-flex items-center gap-1.5" title={describeFreshAge(entry)}>
				<Badge tone="emerald">Fresh</Badge>
				<span className="text-xs text-muted-foreground">{describeFreshAge(entry)}</span>
			</span>
		);
	}
	if (entry.staleReport) {
		return (
			<span title={describeReportFreshness(entry)}>
				<Badge tone="amber">Stale</Badge>
			</span>
		);
	}
	if (entry.missingReport) return <Badge tone="red">Missing</Badge>;
	return <span className="text-xs text-muted-foreground">No report</span>;
}

export function AuditCompactRow({
	auditsEnabled,
	changeOverride,
	expanded,
	launchPending,
	onToggleExpanded,
	onToggleSelected,
	row,
	runSingle,
	selected,
	updateOverridesPending,
}: {
	auditsEnabled: boolean;
	changeOverride: (name: string, value: OverrideValue) => void;
	expanded: boolean;
	launchPending: boolean;
	onToggleExpanded: () => void;
	onToggleSelected: () => void;
	row: ProjectAuditEntry;
	runSingle: (name: string, review: boolean) => void;
	selected: boolean;
	updateOverridesPending: boolean;
}) {
	const detailsId = useId();
	const overrideValue: OverrideValue = row.overrideEffect ?? 'default';
	const rowDisabled = !auditsEnabled || !row.enabled;
	const rowTooltip = !auditsEnabled
		? 'Audits are globally disabled.'
		: !row.enabled
			? 'This audit is disabled for the project.'
			: undefined;

	return (
		<Card className="p-0">
			<div className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
				<label className="flex min-w-0 items-start gap-2 max-sm:min-h-11">
					<Checkbox
						aria-label={`Select ${row.name}`}
						checked={selected}
						className="mt-1"
						disabled={!row.enabled || !auditsEnabled}
						onChange={onToggleSelected}
					/>
					<span className="min-w-0">
						<span className="block font-medium text-foreground">{row.name}</span>
						<span
							className="block truncate font-mono text-xs text-muted-foreground"
							title={row.path}>
							{auditPathTail(row.path)}
						</span>
					</span>
				</label>
				<div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
					{stateBadge(row)}
					<ReportState entry={row} />
					<Button
						aria-controls={detailsId}
						aria-expanded={expanded}
						className="ml-auto"
						onClick={onToggleExpanded}
						size="compact"
						variant="ghost">
						{expanded ? 'Hide details' : 'Details'}
						<ChevronDown
							className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
						/>
					</Button>
				</div>
			</div>
			{expanded ? (
				<div className="border-t border-border p-3" id={detailsId}>
					<dl className="grid gap-3 text-xs sm:grid-cols-3">
						<div className="space-y-1">
							<dt className="font-medium text-muted-foreground uppercase">
								Change potential
							</dt>
							<dd>
								{row.changePotential ? (
									<span
										className="inline-flex items-center gap-2"
										title={describeChangePotential(row.changePotential)}>
										<Badge tone={bandTone[row.changePotential.band]}>
											{row.changePotential.band}
										</Badge>
										<span className="text-muted-foreground tabular-nums">
											{row.changePotential.score}
										</span>
									</span>
								) : (
									<span className="text-muted-foreground">—</span>
								)}
							</dd>
						</div>
						<div className="space-y-1">
							<dt className="font-medium text-muted-foreground uppercase">Report</dt>
							<dd>
								<ReportState entry={row} />
							</dd>
						</div>
						<div className="space-y-1">
							<dt className="font-medium text-muted-foreground uppercase">
								Override
							</dt>
							<dd>
								<select
									aria-label={`Override for ${row.name}`}
									className={selectClass}
									disabled={updateOverridesPending}
									onChange={(event) =>
										changeOverride(
											row.name,
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
							onClick={() => runSingle(row.name, false)}
							title={rowTooltip}
							variant="secondary">
							Run
						</Button>
						<Button
							disabled={rowDisabled || launchPending}
							onClick={() => runSingle(row.name, true)}
							title={rowTooltip}
							variant="secondary">
							Review
						</Button>
					</div>
				</div>
			) : null}
		</Card>
	);
}
