import type { MaturityDetail, ProjectArtifactRecord } from '../../../api/types.ts';
import type { SegmentedControlOption } from '../../../components/ui/segmented-control.tsx';

import { DisclosureMarker } from '../../../components/shared/DisclosureMarker.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { SegmentedControl } from '../../../components/ui/segmented-control.tsx';
import { cn } from '../../../lib/cn.ts';
import { microLabelClass } from '../../../lib/typography.ts';
import {
	artifactEntryState,
	type ArtifactFilter,
	artifactRecordState,
	artifactRecordSummary,
	artifactStateSummary,
	artifactSummaryPresentation,
} from './artifactGroupFilters.ts';
import { ArtifactRow } from './ArtifactRow.tsx';
import { type ArtifactViewerTarget, buildArtifactInventory } from './artifactsUtils.ts';
import { MaturityArtifactRow } from './MaturityArtifactRow.tsx';

const groupHeadingClass = `text-muted-foreground ${microLabelClass}`;

// Lives beside its only consumer rather than in artifactGroupFilters.ts, so that module stays
// free of .tsx imports: the root tsconfig has no `jsx` setting, and a test importing the
// classification helpers used to drag this type through it and fail the typecheck.
const artifactFilterOptions: readonly SegmentedControlOption<ArtifactFilter>[] = [
	{ label: 'All', value: 'all' },
	{ label: 'Missing', value: 'missing' },
	{ label: 'Stale', value: 'stale' },
];

function InventoryFilter({
	onChange,
	value,
}: {
	onChange: (value: ArtifactFilter) => void;
	value: ArtifactFilter;
}) {
	return (
		<SegmentedControl
			ariaLabel="Filter artifact inventory"
			className="max-sm:[&>button]:flex-1"
			onChange={onChange}
			options={artifactFilterOptions}
			value={value}
		/>
	);
}

interface ArtifactGroupsProps {
	className?: string;
	disabled: boolean;
	filter: ArtifactFilter;
	maturity: MaturityDetail | null;
	onFilterChange: (value: ArtifactFilter) => void;
	onOpen?: ((target: ArtifactViewerTarget) => void) | undefined;
	onToggleSkip?: ((slug: string, skip: boolean) => void) | undefined;
	records: ProjectArtifactRecord[];
	skipSet: Set<string>;
}

export function ArtifactGroups({
	className,
	disabled,
	filter,
	maturity,
	onFilterChange,
	onOpen,
	onToggleSkip,
	records,
	skipSet,
}: ArtifactGroupsProps) {
	if (!maturity) {
		const fullSummary = artifactRecordSummary(records, skipSet);
		const summary = artifactSummaryPresentation(fullSummary);
		const visibleRecords = records.filter(
			(record) => filter === 'all' || artifactRecordState(record, skipSet) === filter,
		);
		return (
			<div className="space-y-3">
				<InventoryFilter onChange={onFilterChange} value={filter} />
				<details
					className="group"
					open={summary.missing > 0 || summary.stale > 0 || records.length > 0}>
					<summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-2 marker:content-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:outline-none">
						<DisclosureMarker />
						<h4 className={groupHeadingClass}>Other artifacts</h4>
						<span className="text-xs text-muted-foreground tabular-nums">
							{visibleRecords.length} of {records.length}
						</span>
						<Badge tone={summary.tone}>{summary.label}</Badge>
					</summary>
					<div className="mt-2 flex flex-col gap-2">
						{visibleRecords.map((record) => (
							<ArtifactRow
								disabled={disabled}
								key={record.label}
								onOpen={onOpen}
								record={record}
								skipped={skipSet.has(record.label)}
							/>
						))}
						{visibleRecords.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No artifacts match this filter.
							</p>
						) : null}
					</div>
				</details>
			</div>
		);
	}

	const inventory = buildArtifactInventory(records, maturity);
	const fullGroupSummaries = new Map(
		inventory.groups.map((group) => [group.id, artifactStateSummary(group.entries, skipSet)]),
	);
	const ungroupedRecordSummary = artifactRecordSummary(inventory.ungrouped, skipSet);
	const ungroupedSummary = artifactSummaryPresentation(ungroupedRecordSummary);
	const firstAttentionGroup = inventory.groups.find((group) => {
		const summary = fullGroupSummaries.get(group.id);
		return summary !== undefined && (summary.missing > 0 || summary.stale > 0);
	});
	const defaultOpenGroupId =
		firstAttentionGroup?.id ??
		(ungroupedSummary.missing > 0 || ungroupedSummary.stale > 0
			? 'ungrouped'
			: (inventory.groups[0]?.id ?? 'ungrouped'));
	const visibleGroups = inventory.groups
		.map((group) => {
			const entries = group.entries.filter(
				(entry) => filter === 'all' || artifactEntryState(entry, skipSet) === filter,
			);
			return {
				...group,
				entries,
				summary:
					fullGroupSummaries.get(group.id) ??
					artifactStateSummary(group.entries, skipSet),
				total: group.entries.length,
			};
		})
		.filter((group) => group.entries.length > 0);
	const visibleUngrouped = inventory.ungrouped.filter(
		(record) => filter === 'all' || artifactRecordState(record, skipSet) === filter,
	);

	return (
		<div className="@container space-y-3">
			<InventoryFilter onChange={onFilterChange} value={filter} />
			<div
				className={cn(
					'grid grid-flow-dense items-start gap-x-4 gap-y-3 @min-[70rem]:grid-cols-2',
					className,
				)}>
				{visibleGroups.map((group) => {
					const allRequired = group.entries.every(({ artifact }) => artifact.required);
					return (
						<details
							className="group [&[open]]:col-span-full"
							key={group.id}
							open={filter !== 'all' || group.id === defaultOpenGroupId}>
							<summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-2 marker:content-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:outline-none">
								<DisclosureMarker />
								<h4 className={groupHeadingClass}>{group.label}</h4>
								<span className="text-xs text-muted-foreground tabular-nums">
									{group.entries.length} of {group.total}
								</span>
								<Badge tone={group.summary.tone}>{group.summary.label}</Badge>
								{group.summary.missing > 0 && group.summary.stale > 0 ? (
									<Badge tone="amber">{group.summary.stale} stale</Badge>
								) : null}
								{/* Skipped entries are excluded from the badge's count, so a group
								    carrying some says so here. Suppressed when the badge already
								    reads "not applicable", which is the whole-group case. */}
								{group.summary.skipped > 0 &&
								group.summary.skipped !== group.entries.length ? (
									<Badge tone="neutral">
										{group.summary.skipped} not applicable
									</Badge>
								) : null}
							</summary>
							<div className="mt-2 flex flex-col gap-2">
								{group.entries.map(({ artifact, record }) =>
									record ? (
										<ArtifactRow
											disabled={disabled}
											key={artifact.slug}
											onOpen={onOpen}
											onToggleSkip={onToggleSkip}
											record={record}
											skipped={skipSet.has(artifact.slug)}
										/>
									) : (
										<MaturityArtifactRow
											artifact={artifact}
											disabled={disabled}
											hideRequired={allRequired}
											key={artifact.slug}
											onOpen={onOpen}
											onToggleSkip={onToggleSkip}
										/>
									),
								)}
							</div>
						</details>
					);
				})}
				{visibleUngrouped.length > 0 ? (
					<details
						className="group [&[open]]:col-span-full"
						open={filter !== 'all' || defaultOpenGroupId === 'ungrouped'}>
						<summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-2 marker:content-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:outline-none">
							<DisclosureMarker />
							<h4 className={groupHeadingClass}>Other artifacts</h4>
							<span className="text-xs text-muted-foreground tabular-nums">
								{visibleUngrouped.length} of {inventory.ungrouped.length}
							</span>
							<Badge tone={ungroupedSummary.tone}>{ungroupedSummary.label}</Badge>
						</summary>
						<div className="mt-2 flex flex-col gap-2">
							{visibleUngrouped.map((record) => (
								<ArtifactRow
									disabled={disabled}
									key={record.label}
									onOpen={onOpen}
									record={record}
									skipped={skipSet.has(record.label)}
								/>
							))}
						</div>
					</details>
				) : null}
				{visibleGroups.length === 0 && visibleUngrouped.length === 0 ? (
					<p className="col-span-full text-sm text-muted-foreground">
						No artifacts match this filter.
					</p>
				) : null}
			</div>
		</div>
	);
}
