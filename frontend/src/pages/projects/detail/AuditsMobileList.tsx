import { useState } from 'react';

import type { ProjectAuditEntry, ProjectFeature } from '../../../api/types.ts';
import type { FilterRegister } from '../../../lib/filterFields.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Button } from '../../../components/ui/button.tsx';
import {
	useViewportFill,
	viewportFillPhonePageListClass,
	viewportFillPhonePageRootClass,
} from '../../../hooks/useViewportFill.ts';
import { AuditCompactRow } from './AuditCompactRow.tsx';
import { activeAuditFindings, type OverrideValue } from './auditsTabUtils.ts';
import { projectDetailViewportGutterPx } from './projectDetailViewport.ts';

export function AuditsMobileList({
	auditsEnabled,
	changeOverride,
	dismissPending,
	emptyFilters,
	features,
	launchPending,
	onClearAll,
	onDismiss,
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
	dismissPending: boolean;
	/** The filters that narrowed the list to nothing, when any are in force. */
	emptyFilters: FilterRegister | undefined;
	features: ProjectFeature[];
	launchPending: boolean;
	onClearAll: () => void;
	onDismiss: (finding: ProjectFeature) => void;
	onSelectAll: () => void;
	onToggleSelected: (name: string) => void;
	rows: ProjectAuditEntry[];
	runSingle: (name: string, review: boolean) => void;
	selectableNames: string[];
	selected: string[];
	updateOverridesPending: boolean;
}) {
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
	const listRef = useViewportFill<HTMLDivElement>({
		gutterPx: projectDetailViewportGutterPx,
		mode: 'page-on-phone',
		refreshKey: rows,
	});
	const allSelected =
		selectableNames.length > 0 && selectableNames.every((name) => selected.includes(name));

	if (rows.length === 0) {
		return (
			<EmptyState
				className="@min-[60rem]:hidden"
				filterReset="toolbar"
				filters={emptyFilters}>
				No audits match the current filters.
			</EmptyState>
		);
	}

	return (
		<div ref={listRef}>
			<OverflowScroller
				ariaLabel="Project audits compact inventory"
				className={`@min-[60rem]:hidden ${viewportFillPhonePageRootClass}`}
				scrollerClassName={viewportFillPhonePageListClass}
				surface="background">
				<div className="space-y-2 pr-1">
					<div className="sticky top-[var(--app-topbar-height,0px)] z-20 flex min-h-11 items-center justify-between gap-2 border-b border-border bg-background px-1 py-2 sm:top-px">
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
							dismissPending={dismissPending}
							expanded={expanded.has(row.name)}
							findings={activeAuditFindings(features, row.name)}
							key={row.name}
							launchPending={launchPending}
							onDismiss={onDismiss}
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
		</div>
	);
}
