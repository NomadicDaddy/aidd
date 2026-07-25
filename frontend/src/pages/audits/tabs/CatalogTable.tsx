import type { AuditDefinition } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { bandTone, bucketColumns, describeChangePotential } from '../auditsUtils.ts';

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
			<Card className="hidden overflow-x-auto p-0 md:block">
				<table
					aria-label="Audit catalog"
					className="w-full min-w-[960px] text-left text-sm">
					<thead className="border-b bg-neutral-50 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-900">
						<tr>
							<th className="px-4 py-3" scope="col">
								<input
									aria-label="Select all visible enabled audits"
									checked={allSelected}
									disabled={!hasSelectableDefinitions}
									onChange={handleHeaderCheckbox}
									ref={(el) => {
										if (el) el.indeterminate = someSelected && !allSelected;
									}}
									type="checkbox"
								/>
							</th>
							<th className="px-4 py-3" scope="col">
								Audit
							</th>
							<th className="px-4 py-3" scope="col">
								Change Potential
							</th>
							<th className="px-4 py-3" scope="col">
								Projects
							</th>
							<th className="px-4 py-3" scope="col">
								Reports
							</th>
							<th className="px-4 py-3" scope="col">
								Buckets
							</th>
						</tr>
					</thead>
					<tbody>
						{definitions.map((item) => (
							<tr
								className={`cursor-pointer border-b last:border-0 dark:border-neutral-800 ${selectedAudit === item.name ? 'bg-teal-50 dark:bg-teal-950/30' : ''}`}
								key={item.name}
								onClick={() => onSelect(item.name)}>
								<td className="px-4 py-3">
									<input
										aria-label={`Select ${item.name} for launch`}
										checked={selectedAuditNames.includes(item.name)}
										disabled={!item.enabled}
										onChange={() => onToggleSelected(item.name)}
										onClick={(event) => event.stopPropagation()}
										type="checkbox"
									/>
								</td>
								<td className="px-4 py-3">
									<div className="font-medium text-foreground">{item.name}</div>
									<div className="text-xs break-all text-neutral-500">
										{item.path}
									</div>
								</td>
								<td className="px-4 py-3">
									{item.changePotential ? (
										<span
											className="inline-flex items-center gap-2"
											title={describeChangePotential(item.changePotential)}>
											<Badge tone={bandTone[item.changePotential.band]}>
												{item.changePotential.band}
											</Badge>
											<span className="text-xs text-neutral-500">
												{item.changePotential.score} •{' '}
												{item.changePotential.confidence.toLowerCase()} conf
											</span>
										</span>
									) : (
										<span className="text-xs text-neutral-400">—</span>
									)}
								</td>
								<td className="px-4 py-3">
									{item.applicableProjectCount} applicable
								</td>
								<td className="px-4 py-3">
									<span className="text-emerald-700">
										{item.freshReportCount} fresh
									</span>
									<span className="mx-2 text-neutral-400">/</span>
									<span className="text-amber-700">
										{item.staleReportCount} stale
									</span>
									<span className="mx-2 text-neutral-400">/</span>
									<span className="text-red-700">
										{item.missingReportCount} missing
									</span>
								</td>
								<td className="px-4 py-3 text-xs">
									<button
										className="text-teal-700 hover:underline dark:text-teal-300"
										onClick={(event) => {
											event.stopPropagation();
											onJumpToMatrix();
										}}
										type="button">
										{item.applicableBucketCount}/{bucketColumns.length} buckets
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</Card>

			<div className="space-y-2 md:hidden">
				{definitions.length > 0 ? (
					<div className="flex justify-end">
						<button
							className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-900"
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
							className={`w-full rounded-md border p-3 text-left transition-colors ${active ? 'border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30' : 'border-neutral-200 hover:bg-teal-50/60 dark:border-neutral-800 dark:hover:bg-teal-950/20'}`}
							key={item.name}
							role="group">
							<div className="flex items-start justify-between gap-2">
								<div className="flex min-w-0 items-start gap-2">
									<input
										aria-label={`Select ${item.name} for launch`}
										checked={checked}
										className="mt-1"
										disabled={!item.enabled}
										onChange={() => onToggleSelected(item.name)}
										type="checkbox"
									/>
									<button
										aria-pressed={active}
										className="min-w-0 text-left focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none"
										onClick={() => onSelect(item.name)}
										type="button">
										<span className="block font-medium text-foreground">
											{item.name}
										</span>
										<span className="block text-xs break-all text-neutral-500">
											{item.path}
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
									<dt className="font-medium text-neutral-500 uppercase">
										Change
									</dt>
									<dd
										className="text-neutral-700 dark:text-neutral-300"
										title={
											item.changePotential
												? describeChangePotential(item.changePotential)
												: undefined
										}>
										{item.changePotential
											? `${item.changePotential.score} • ${item.changePotential.confidence.toLowerCase()} conf`
											: '—'}
									</dd>
								</div>
								<div className="space-y-1">
									<dt className="font-medium text-neutral-500 uppercase">
										Projects
									</dt>
									<dd className="text-neutral-700 dark:text-neutral-300">
										{item.applicableProjectCount} applicable
									</dd>
								</div>
								<div className="col-span-2 space-y-1">
									<dt className="font-medium text-neutral-500 uppercase">
										Reports
									</dt>
									<dd className="text-xs">
										<span className="text-emerald-700">
											{item.freshReportCount} fresh
										</span>
										<span className="mx-2 text-neutral-400">/</span>
										<span className="text-amber-700">
											{item.staleReportCount} stale
										</span>
										<span className="mx-2 text-neutral-400">/</span>
										<span className="text-red-700">
											{item.missingReportCount} missing
										</span>
									</dd>
								</div>
								<div className="col-span-2 space-y-1">
									<dt className="font-medium text-neutral-500 uppercase">
										Buckets
									</dt>
									<dd>
										<button
											className="text-xs text-teal-700 hover:underline dark:text-teal-300"
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
