import { useId } from 'react';

import type { ProjectAuditEntry, ProjectFeature } from '../../../api/types.ts';

import { Card } from '../../../components/ui/card.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
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
import { type OverrideValue } from './auditsTabUtils.ts';

export function AuditCompactRow({
	auditsEnabled,
	changeOverride,
	expanded,
	findings,
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
	findings: ProjectFeature[];
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
	const rowTooltip = !auditsEnabled
		? 'Audits are globally disabled.'
		: !row.enabled
			? 'This audit is disabled for the project.'
			: undefined;

	return (
		<Card className="p-0">
			<div className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
				<div className="flex min-w-0 items-start gap-2 max-sm:min-h-11">
					<Checkbox
						aria-label={`Select ${row.name}`}
						checked={selected}
						className="mt-1"
						disabled={!row.enabled || !auditsEnabled}
						onChange={onToggleSelected}
					/>
					<span className="min-w-0">
						<span className="block font-medium text-foreground">{row.name}</span>
						<AuditPath entry={row} />
					</span>
				</div>
				<div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
					<AuditStateBadge entry={row} />
					<AuditReportState entry={row} />
					<div className="ml-auto">
						<AuditDetailsToggle
							auditName={row.name}
							detailsId={detailsId}
							expanded={expanded}
							findingCount={findings.length}
							onToggle={onToggleExpanded}
						/>
					</div>
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
								<AuditChangePotential entry={row} />
							</dd>
						</div>
						<div className="space-y-1">
							<dt className="font-medium text-muted-foreground uppercase">Report</dt>
							<dd>
								<AuditReportState entry={row} />
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
						<div className="space-y-1 sm:col-span-3">
							<dt className="font-medium text-muted-foreground uppercase">
								Definition path
							</dt>
							<dd className="font-mono break-all text-muted-foreground">
								{row.path}
							</dd>
						</div>
					</dl>
					<div className="mt-3 border-t border-border pt-3">
						<AuditFindingList auditName={row.name} findings={findings} />
					</div>
					<div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
						<AuditActionButton
							disabledReason={rowTooltip}
							label="Run"
							onClick={() => runSingle(row.name, false)}
							pending={launchPending}
						/>
						<AuditActionButton
							disabledReason={rowTooltip}
							label="Review"
							onClick={() => runSingle(row.name, true)}
							pending={launchPending}
						/>
					</div>
				</div>
			) : null}
		</Card>
	);
}
