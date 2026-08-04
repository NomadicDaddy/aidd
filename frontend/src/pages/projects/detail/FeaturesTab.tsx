import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import type { ProjectDetail, ProjectRoadmapSummary } from '../../../api/types.ts';

import { ConfirmDialog } from '../../../components/shared/ConfirmDialog.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { FeatureDetailsDialog } from './FeatureDetailsDialog.tsx';
import { FeatureFilters } from './FeatureFilters.tsx';
import { FeatureLaunchTargetRow } from './FeatureLaunchTargetRow.tsx';
import { FeatureMobileCard } from './FeatureMobileCard.tsx';
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
		decisions,
		deleteFeature,
		filteredTotal,
		filterMilestoneOptions,
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
		query,
		resetFilters,
		selectedFeature,
		setDecisions,
		setLaunchTarget,
		setPage,
		setPendingDelete,
		setSelectedFeature,
		showUnassigned,
		slice,
		sourceFilter,
		sourceOptions,
		statusFilter,
		total,
		updateFilterParam,
	} = useFeaturesTab({ features, projectId, projectPath, roadmap });

	if (total === 0) {
		return (
			<Card className="py-10 text-center text-sm text-muted-foreground">
				This project has no features in <code>.aidd/features</code> yet.
			</Card>
		);
	}
	return (
		<>
			<FeatureFilters
				filteredTotal={filteredTotal}
				hasFilters={hasFilters}
				milestoneFilter={milestoneFilter}
				milestoneOptions={filterMilestoneOptions}
				onFilterChange={updateFilterParam}
				onResetFilters={resetFilters}
				query={query}
				sourceFilter={sourceFilter}
				sourceOptions={sourceOptions}
				statusFilter={statusFilter}
				total={total}
			/>
			<FeatureLaunchTargetRow
				label="Feature runs use"
				onChange={setLaunchTarget}
				projectDir={projectPath}
				value={launchTarget}
			/>
			{(() => {
				const gate = unmappedRoadmapCallout(roadmap);
				if (!gate) return null;
				return (
					<Card className="flex flex-wrap items-center gap-2 border-red-300 dark:border-red-900">
						<ShieldCheck className="h-4 w-4 text-red-500" />
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
					<ShieldCheck className="h-4 w-4 text-amber-500" />
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
				<Card className="py-10 text-center text-sm text-muted-foreground">
					<p>No features match the active filters.</p>
					<Button className="mt-4" onClick={resetFilters} variant="secondary">
						<X className="h-4 w-4" />
						Reset filters
					</Button>
				</Card>
			) : null}
			{filteredTotal > 0 ? (
				<Card className="overflow-hidden p-0">
					<FeaturesDesktopTable
						decisions={decisions}
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
						roadmap={roadmap}
						rows={slice}
						runActive={hasActiveRun}
					/>
					<div className="flex flex-col gap-3 p-4 md:hidden">
						{slice.map((feature) => {
							const id = feature.id || stringValue(feature, 'id');
							const directory = featureDirectory(feature);
							return (
								<FeatureMobileCard
									decision={decisions[directory] ?? ''}
									disabled={isMutating}
									feature={feature}
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
			<ConfirmDialog
				confirmLabel="Delete feature"
				description={
					pendingDelete
						? `${featureDirectory(pendingDelete)} will be removed from .aidd/features. This cannot be undone.`
						: undefined
				}
				destructive
				isPending={deleteFeature.isPending}
				onClose={() => {
					if (!deleteFeature.isPending) setPendingDelete(null);
				}}
				onConfirm={confirmDelete}
				open={pendingDelete !== null}
				title="Delete feature?"
			/>
		</>
	);
}
