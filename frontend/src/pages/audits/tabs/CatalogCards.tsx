import type { AuditDefinition } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import {
	auditFileName,
	bandTone,
	bucketsColumnLabel,
	describeChangePotential,
	reportsColumnLabel,
} from '../auditsUtils.ts';
import { ReportCounts } from './catalogCells.tsx';

interface CatalogCardsProps {
	allSelected: boolean;
	definitions: AuditDefinition[];
	onClearAll: () => void;
	onJumpToMatrix: () => void;
	onSelect: (name: string) => void;
	onSelectAll: () => void;
	onToggleSelected: (name: string) => void;
	selectedAudit: null | string;
	selectedAuditNames: string[];
}

/**
 * The catalog below `xl`, where the table's seven columns do not fit.
 *
 * Split out of `CatalogTable.tsx` when the units moved into the column headers: the two renderings
 * share their data and nothing else, and together they crossed the per-file line cap.
 */
export function CatalogCards({
	allSelected,
	definitions,
	onClearAll,
	onJumpToMatrix,
	onSelect,
	onSelectAll,
	onToggleSelected,
	selectedAudit,
	selectedAuditNames,
}: CatalogCardsProps) {
	return (
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
									checked={selectedAuditNames.includes(item.name)}
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
									Change score
								</dt>
								<dd
									className="text-foreground tabular-nums"
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
									Applicable projects
								</dt>
								<dd className="text-foreground tabular-nums">
									{item.applicableProjectCount}
								</dd>
							</div>
							<div className="col-span-2 space-y-1">
								<dt className="font-medium text-muted-foreground uppercase">
									{reportsColumnLabel}
								</dt>
								<dd className="text-xs">
									<ReportCounts definition={item} />
								</dd>
							</div>
							<div className="col-span-2 space-y-1">
								<dt className="font-medium text-muted-foreground uppercase">
									{bucketsColumnLabel}
								</dt>
								<dd>
									<button
										className="text-xs text-accent tabular-nums hover:underline"
										onClick={(event) => {
											event.stopPropagation();
											onJumpToMatrix();
										}}
										type="button">
										{item.applicableBucketCount}
									</button>
								</dd>
							</div>
						</dl>
					</div>
				);
			})}
		</div>
	);
}
