import type { AuditDefinition } from '../../../api/types.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { toneText } from '../../../lib/tones.ts';
import { auditFileName, bandTone, bucketColumns, describeChangePotential } from '../auditsUtils.ts';

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
			<Card className="hidden p-0 xl:block">
				<OverflowScroller ariaLabel="Audit catalog">
					<table
						aria-label="Audit catalog"
						className="w-full min-w-[840px] text-left text-sm">
						<thead className={tableHeadClass}>
							<tr>
								<th className="px-3 py-3" scope="col">
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
								<th className="px-3 py-3" scope="col">
									Audit
								</th>
								<th className="px-3 py-3" scope="col">
									Change Potential
								</th>
								<th className="px-3 py-3" scope="col">
									Projects
								</th>
								<th className="px-3 py-3" scope="col">
									Reports
								</th>
								<th className="px-3 py-3" scope="col">
									Buckets
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
											<span
												className="inline-flex items-center gap-2"
												title={describeChangePotential(
													item.changePotential,
												)}>
												<Badge tone={bandTone[item.changePotential.band]}>
													{item.changePotential.band}
												</Badge>
												{/* The confidence reads the same on every visible row; it stays in the
											    tooltip with the rest of the evidence. */}
												<span className="text-xs text-muted-foreground tabular-nums">
													{item.changePotential.score}
												</span>
											</span>
										) : (
											<span className="text-xs text-muted-foreground">—</span>
										)}
									</td>
									<td className="px-3 py-3">
										{item.applicableProjectCount} applicable
									</td>
									<td className="px-3 py-3">
										<span className={toneText.emerald}>
											{item.freshReportCount} fresh
										</span>
										<span className="mx-2 text-muted-foreground">/</span>
										<span className={toneText.amber}>
											{item.staleReportCount} stale
										</span>
										<span className="mx-2 text-muted-foreground">/</span>
										<span className={toneText.red}>
											{item.missingReportCount} missing
										</span>
									</td>
									<td className="px-4 py-3 text-xs">
										<button
											className="text-accent hover:underline"
											onClick={(event) => {
												event.stopPropagation();
												onJumpToMatrix();
											}}
											type="button">
											{item.applicableBucketCount}/{bucketColumns.length}{' '}
											buckets
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</OverflowScroller>
			</Card>

			<div className="space-y-2 xl:hidden">
				{definitions.length > 0 ? (
					<div className="flex justify-end">
						<button
							className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
							onClick={allSelected ? onClearAll : onSelectAll}
							type="button">
							{allSelected ? 'Unselect All' : 'Select All'}
						</button>
					</div>
				) : null}
				{definitions.map((item) => {
					const active = selectedAudit === item.name;
					const checked = selectedAuditNames.includes(item.name);
					return (
						<div
							aria-label={item.name}
							className={`w-full rounded-md border p-3 text-left transition-colors ${active ? 'border-accent bg-accent-muted text-accent-muted-foreground' : 'border-border hover:bg-muted/60'}`}
							key={item.name}
							role="group">
							<div className="flex items-start justify-between gap-2">
								<div className="flex min-w-0 items-start gap-2">
									<Checkbox
										aria-label={`Select ${item.name} for launch`}
										checked={checked}
										className="mt-1"
										disabled={!item.enabled}
										onChange={() => onToggleSelected(item.name)}
									/>
									<button
										aria-pressed={active}
										className="min-w-0 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
										onClick={() => onSelect(item.name)}
										type="button">
										<span className="block font-medium text-foreground">
											{item.name}
										</span>
										<span
											className="block truncate text-xs text-muted-foreground"
											title={item.path}>
											{auditFileName(item.path)}
										</span>
									</button>
								</div>
								<div className="shrink-0">
									{item.changePotential ? (
										<Badge tone={bandTone[item.changePotential.band]}>
											{item.changePotential.band}
										</Badge>
									) : null}
								</div>
							</div>
							<dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
								<div className="space-y-1">
									<dt className="font-medium text-muted-foreground uppercase">
										Change
									</dt>
									<dd
										className="text-foreground"
										title={
											item.changePotential
												? describeChangePotential(item.changePotential)
												: undefined
										}>
										{item.changePotential ? item.changePotential.score : '—'}
									</dd>
								</div>
								<div className="space-y-1">
									<dt className="font-medium text-muted-foreground uppercase">
										Projects
									</dt>
									<dd className="text-foreground">
										{item.applicableProjectCount} applicable
									</dd>
								</div>
								<div className="col-span-2 space-y-1">
									<dt className="font-medium text-muted-foreground uppercase">
										Reports
									</dt>
									<dd className="text-xs">
										<span className={toneText.emerald}>
											{item.freshReportCount} fresh
										</span>
										<span className="mx-2 text-muted-foreground">/</span>
										<span className={toneText.amber}>
											{item.staleReportCount} stale
										</span>
										<span className="mx-2 text-muted-foreground">/</span>
										<span className={toneText.red}>
											{item.missingReportCount} missing
										</span>
									</dd>
								</div>
								<div className="col-span-2 space-y-1">
									<dt className="font-medium text-muted-foreground uppercase">
										Buckets
									</dt>
									<dd>
										<button
											className="text-xs text-accent hover:underline"
											onClick={(event) => {
												event.stopPropagation();
												onJumpToMatrix();
											}}
											type="button">
											{item.applicableBucketCount}/{bucketColumns.length}{' '}
											buckets
										</button>
									</dd>
								</div>
							</dl>
						</div>
					);
				})}
			</div>
		</div>
	);
}
