import { useState } from 'react';

import type { ProjectAuditEntry } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { AuditCompactRow } from './AuditCompactRow.tsx';
import { type OverrideValue } from './auditsTabUtils.tsx';

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
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
	const allSelected =
		selectableNames.length > 0 && selectableNames.every((name) => selected.includes(name));

	if (rows.length === 0) {
		return <EmptyState className="xl:hidden">No audits match the current filters.</EmptyState>;
	}

	return (
		<OverflowScroller
			ariaLabel="Project audits compact inventory"
			className="xl:hidden"
			scrollerClassName="max-h-[28rem] overflow-y-auto"
			surface="background">
			<div className="space-y-2 pr-1">
				<div className="sticky top-px z-20 flex min-h-11 items-center justify-between gap-2 border-b border-border bg-background px-1 py-2">
					<span className="text-xs text-muted-foreground tabular-nums">
						{selected.length} selected · {rows.length} audits
					</span>
					{selectableNames.length > 0 ? (
						<Button
							disabled={!auditsEnabled}
							onClick={allSelected ? onClearAll : onSelectAll}
							size="compact"
							variant="secondary">
							{allSelected ? 'Unselect all' : 'Select all'}
						</Button>
					) : null}
				</div>
				{rows.map((row) => (
					<AuditCompactRow
						auditsEnabled={auditsEnabled}
						changeOverride={changeOverride}
						expanded={expanded.has(row.name)}
						key={row.name}
						launchPending={launchPending}
						onToggleExpanded={() =>
							setExpanded((current) => {
								const next = new Set(current);
								if (next.has(row.name)) next.delete(row.name);
								else next.add(row.name);
								return next;
							})
						}
						onToggleSelected={() => onToggleSelected(row.name)}
						row={row}
						runSingle={runSingle}
						selected={selected.includes(row.name)}
						updateOverridesPending={updateOverridesPending}
					/>
				))}
			</div>
		</OverflowScroller>
	);
}
