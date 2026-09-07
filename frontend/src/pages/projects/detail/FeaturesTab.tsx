import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';

import type { ProjectDetail, ProjectRoadmapSummary } from '../../../api/types.ts';

import { CardSortControl } from '../../../components/shared/CardSortControl.tsx';
import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { cn } from '../../../lib/cn.ts';
import { toneBorder, toneText } from '../../../lib/tones.ts';
import { FeatureDetailsDialog } from './FeatureDetailsDialog.tsx';
import { FeatureDispositionDialogs } from './FeatureDispositionDialogs.tsx';
import { featureFilterRegister } from './featureFilterRegister.ts';
import { FeatureFilters } from './FeatureFilters.tsx';
import { FeatureLaunchTargetRow } from './FeatureLaunchTargetRow.tsx';
import { FeatureMobileCard } from './FeatureMobileCard.tsx';
import { FEATURE_SORT_COLUMNS } from './features-list-sort.ts';
import { FeaturesDesktopTable } from './FeaturesDesktopTable.tsx';
import { featureDirectory, unmappedRoadmapCallout } from './featuresUtils.ts';
import { Pagination } from './Pagination.tsx';
import { FEATURES_PAGE_SIZE, stringValue } from './shared.ts';
import { useFeaturesTab } from './useFeaturesTab.ts';

export function FeaturesTab({
	features,
	projectId,
	projectPath,
	roadmap,
}: {
	features: ProjectDetail['features'];
	projectId: string;
	projectPath: string;
	roadmap: null | ProjectRoadmapSummary;
}) {
	const {
		auditFindingsCount,
		auditFindingsSource,
		confirmDelete,
		confirmDismissal,
		decisions,
		deleteFeature,
		dismissFeature,
		filteredTotal,
		filterMilestoneOptions,
		filterPriorityOptions,
		hasActiveRun,
		hasFilters,
		isMutating,
		launchingFeature,
		launchTarget,
		milestoneFilter,
		milestoneOptions,
		onApprove,
		onDelete,
		onLaunchRun,
		onMilestoneChange,
		onStatusChange,
		onWorkAuditFindings,
		page,
		pendingDelete,
		pendingDismissal,
		prioritiesAreUniform,
		priorityFilter,
		query,
		resetFilters,
		selectedFeature,
		setDecisions,
		setLaunchTarget,
		setPage,
		setPendingDelete,
		setPendingDismissal,
		setSelectedFeature,
		showUnassigned,
		slice,
		sortDir,
		sortKey,
		sourceFilter,
		sourceOptions,
		statusFilter,
		toggleSort,
		total,
		updateFilterParam,
	} = useFeaturesTab({ features, projectId, projectPath, roadmap });
	const deemphasizePriority = prioritiesAreUniform;
	const emptyFilters = featureFilterRegister(
		{ milestoneFilter, priorityFilter, query, sourceFilter, statusFilter },
		{ filterMilestoneOptions, filterPriorityOptions, sourceOptions },
		resetFilters,
	);

	// Keep both empty registers visually consistent through the shared component.
	if (total === 0) {
		return (
			<EmptyState>
				This project has no features in <code>.aidd/features</code> yet.
			</EmptyState>
		);
	}
	return (
		<div className="space-y-4">
			<TabIntro
				description="Every feature recorded for this project, with its status, priority, milestone and dependencies."
				title="Features"
			/>
			<FeatureFilters
				filteredTotal={filteredTotal}
				hasFilters={hasFilters}
				milestoneFilter={milestoneFilter}
				milestoneOptions={filterMilestoneOptions}
				onFilterChange={updateFilterParam}
				onResetFilters={resetFilters}
				priorityFilter={priorityFilter}
				priorityOptions={filterPriorityOptions}
				query={query}
				sourceFilter={sourceFilter}
				sourceOptions={sourceOptions}
				statusFilter={statusFilter}
				total={total}
			/>
			{(() => {
				const gate = unmappedRoadmapCallout(roadmap);
				if (!gate) return null;
				return (
					<Card className={cn('flex flex-wrap items-center gap-2', toneBorder.red)}>
						<ShieldCheck className={`h-4 w-4 ${toneText.red}`} />
						<span className="text-sm text-muted-foreground">
							{gate.names.length > 0 ? (
								<>
									{gate.names.length} feature director
									{gate.names.length === 1 ? 'y has' : 'ies have'} no roadmap
									milestone and block{gate.names.length === 1 ? 's' : ''} coding
									selection:{' '}
									<span className="font-mono" title={gate.names.join(', ')}>
										{gate.names.slice(0, 5).join(', ')}
										{gate.names.length > 5 ? ', …' : ''}
									</span>
								</>
							) : null}
							{gate.invalid.length > 0 ? (
								<>
									{gate.names.length > 0 ? ' — plus ' : ''}
									{gate.invalid.length} invalid milestone reference
									{gate.invalid.length === 1 ? '' : 's'} (
									<span className="font-mono">
										{gate.invalid
											.slice(0, 3)
											.map(
												(entry) =>
													`${entry.featureDirectory}→${entry.milestone}`,
											)
											.join(', ')}
										{gate.invalid.length > 3 ? ', …' : ''}
									</span>
									)
								</>
							) : null}
						</span>
						{gate.names.length > 0 ? (
							<Button
								className="ml-auto"
								onClick={showUnassigned}
								variant="secondary">
								Show unassigned
							</Button>
						) : null}
					</Card>
				);
			})()}
			{auditFindingsCount > 0 ? (
				<Card className="flex flex-wrap items-center gap-2">
					<ShieldCheck className={`h-4 w-4 ${toneText.amber}`} />
					<span className="text-sm text-muted-foreground">
						{auditFindingsCount} approved audit finding
						{auditFindingsCount === 1 ? '' : 's'}
						{auditFindingsSource ? ` from ${auditFindingsSource}` : ''} ready to work
					</span>
					<Button
						className="ml-auto"
						disabled={isMutating || hasActiveRun}
						onClick={onWorkAuditFindings}
						title={
							auditFindingsSource
								? `Launch a coding sweep over approved ${auditFindingsSource} findings`
								: 'Launch a coding sweep over all approved audit findings'
						}>
						<ShieldCheck className="h-4 w-4" />
						Work approved findings
					</Button>
				</Card>
			) : null}
			{filteredTotal === 0 ? (
				<EmptyState filterReset="toolbar" filters={emptyFilters}>
					No features match the active filters.
				</EmptyState>
			) : null}
			{filteredTotal > 0 ? (
				<Card className="@container max-w-[104rem] overflow-hidden p-0">
					<FeatureLaunchTargetRow
						onChange={setLaunchTarget}
						projectDir={projectPath}
						value={launchTarget}
					/>
					<FeaturesDesktopTable
						decisions={decisions}
						deemphasizePriority={deemphasizePriority}
						inventory={features}
						isMutating={isMutating}
						launchingFeature={launchingFeature}
						milestoneOptions={milestoneOptions}
						onApprove={onApprove}
						onDecisionChange={(directory, value) =>
							setDecisions((current) => ({ ...current, [directory]: value }))
						}
						onDelete={onDelete}
						onLaunchRun={onLaunchRun}
						onMilestoneChange={onMilestoneChange}
						onSelect={setSelectedFeature}
						onStatusChange={onStatusChange}
						onToggleSort={toggleSort}
						query={query}
						roadmap={roadmap}
						rows={slice}
						runActive={hasActiveRun}
						sortDir={sortDir}
						sortKey={sortKey}
					/>
					<div className="flex flex-col gap-3 p-4 @min-[61rem]:hidden">
						<CardSortControl
							onToggleSort={toggleSort}
							options={FEATURE_SORT_COLUMNS}
							phoneInset={false}
							sortDir={sortDir}
							sortKey={sortKey}
						/>
						{slice.map((feature) => {
							const id = feature.id || stringValue(feature, 'id');
							const directory = featureDirectory(feature);
							return (
								<FeatureMobileCard
									decision={decisions[directory] ?? ''}
									deemphasizePriority={deemphasizePriority}
									disabled={isMutating}
									feature={feature}
									inventory={features}
									key={id}
									launching={launchingFeature === directory}
									milestoneOptions={milestoneOptions}
									onApprove={onApprove}
									onDecisionChange={(value) =>
										setDecisions((current) => ({
											...current,
											[directory]: value,
										}))
									}
									onDelete={onDelete}
									onLaunchRun={onLaunchRun}
									onMilestoneChange={onMilestoneChange}
									onSelect={setSelectedFeature}
									onStatusChange={onStatusChange}
									query={query}
									roadmap={roadmap}
									runActive={hasActiveRun}
								/>
							);
						})}
					</div>
					<Pagination
						onChange={setPage}
						page={page}
						pageSize={FEATURES_PAGE_SIZE}
						total={filteredTotal}
					/>
				</Card>
			) : null}
			{selectedFeature ? (
				<FeatureDetailsDialog
					feature={selectedFeature}
					features={features}
					onClose={() => setSelectedFeature(null)}
					projectId={projectId}
				/>
			) : null}
			<FeatureDispositionDialogs
				deletePending={deleteFeature.isPending}
				dismissPending={dismissFeature.isPending}
				onCancelDelete={() => {
					if (!deleteFeature.isPending) setPendingDelete(null);
				}}
				onCancelDismissal={() => {
					if (!dismissFeature.isPending) setPendingDismissal(null);
				}}
				onConfirmDelete={confirmDelete}
				onConfirmDismissal={confirmDismissal}
				pendingDelete={pendingDelete}
				pendingDismissal={pendingDismissal}
			/>
		</div>
	);
}
