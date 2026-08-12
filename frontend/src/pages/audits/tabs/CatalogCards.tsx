import type { AuditDefinition } from '../../../api/types.ts';

import { FilePath } from '../../../components/shared/FilePath.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import { touchTargetBoxClass, touchTargetTextClass } from '../../../lib/touchTarget.ts';
import {
	auditCatalogCardId,
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
					{/* A real bordered button, so it takes the floor by raising its own height the way
					    every `Button` size does. At `py-1.5` it measured 30px. */}
					<button
						className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted max-sm:min-h-11"
						onClick={allSelected ? onClearAll : onSelectAll}
						type="button">
						{allSelected ? 'Unselect All' : 'Select All'}
					</button>
				</div>
			) : null}
			{/* The narrow-viewport twin of CatalogTable's empty row — same wording, so the
			    answer does not change when the layout does. */}
			{definitions.length === 0 ? (
				<p className="px-1 py-6 text-center text-sm text-muted-foreground">
					No audits match the current filters.
				</p>
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
								{/* The one checkbox in the app with no `<label>` around it: the card's
								    text is a button that opens the audit, so it cannot also toggle
								    selection. With no label to enlarge, the 16px box is the whole
								    target and its hit area has to grow around it — so this adds the
								    label the card does not otherwise need, purely as the hit area.
								    The expansion cannot go on the `<input>`: Chrome drops padding on
								    a native checkbox, so it stayed 16x16 while the negative margin
								    pulled it into its neighbours. */}
								<label className={`mt-1 ${touchTargetBoxClass}`}>
									<Checkbox
										aria-label={`Select ${item.name} for launch`}
										checked={selectedAuditNames.includes(item.name)}
										disabled={!item.enabled}
										onChange={() => onToggleSelected(item.name)}
									/>
								</label>
								{/* `max-sm:min-h-11`, not the text expansion: this button is two stacked
								    lines and already has a height (40px), so it takes the floor the
								    same way the `Button` scale does. The text expansion is for a
								    glyph-height box with no height to raise. */}
								<button
									aria-pressed={active}
									className="min-w-0 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:min-h-11"
									id={auditCatalogCardId(item.name)}
									onClick={() => onSelect(item.name)}
									type="button">
									<span className="block font-mono font-medium text-foreground">
										{item.name}
									</span>
									<FilePath
										className="block truncate text-xs text-muted-foreground"
										path={auditFileName(item.path)}
										title={item.path}
									/>
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
									{/* The smallest target measured anywhere in the app: a one- or
									    two-digit count, 16px tall and as little as 7px wide. The text
									    expansion gives it the vertical axis; the horizontal one it
									    does not address, so `min-w-11` supplies it. No negative
									    margin is needed there — this `dd` spans both grid columns and
									    the digit has nothing beside it to displace. */}
									<button
										className={`text-xs text-accent tabular-nums hover:underline max-sm:min-w-11 ${touchTargetTextClass}`}
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
