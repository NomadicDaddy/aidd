import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { useState } from 'react';
import { toast } from 'sonner';

import type { FindingDismissalInput, ProjectFeature } from '../../../api/types.ts';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { FilterSearch, FilterSelect } from '../../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../../components/shared/FilterToolbar.tsx';
import { SkeletonRows } from '../../../components/shared/LoadingState.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { CardHeader } from '../../../components/ui/card.tsx';
import { useDismissProjectFeature } from '../../../hooks/useProjects.ts';
import { countActiveFilters, filterRegister } from '../../../lib/filterFields.ts';
import { tableColumnClass } from '../../../lib/tableStyles.ts';
import { AuditsDesktopTable } from './AuditsDesktopTable.tsx';
import { AuditsMobileList } from './AuditsMobileList.tsx';
import { type AuditSort, type AuditSortKey, sortAudits } from './auditsTabUtils.ts';
import { FindingDismissalDialog } from './FindingDismissalDialog.tsx';
import { useProjectAuditsTab } from './useProjectAuditsTab.ts';

export function AuditsTab({
	features,
	projectId,
	projectName,
}: {
	features: ProjectFeature[];
	projectId: string;
	projectName: string;
}) {
	const [pendingDismissal, setPendingDismissal] = useState<null | ProjectFeature>(null);
	const [sort, setSort] = useState<AuditSort>({ direction: 'asc', key: 'audit' });
	const dismissFeature = useDismissProjectFeature(projectId);
	const {
		audits,
		auditsEnabled,
		changeOverride,
		clearAll,
		enabledFilter,
		filtered,
		launch,
		query,
		runDisabledReason,
		runSelected,
		runSingle,
		selectableNames,
		selectAll,
		selected,
		selectedRunnable,
		setEnabledFilter,
		setQuery,
		toggleSelected,
		updateOverrides,
	} = useProjectAuditsTab(projectId, projectName);
	function resetFilters(): void {
		setQuery('');
		setEnabledFilter('all');
	}
	const emptyFilters = filterRegister(resetFilters, [
		query.trim() !== '' && { label: 'Search', value: query.trim() },
		enabledFilter !== 'all' && { label: 'State', value: enabledFilter },
	]);

	function confirmDismissal(input: FindingDismissalInput): void {
		if (!pendingDismissal) return;
		dismissFeature.mutate(
			{ featureId: pendingDismissal.directory ?? pendingDismissal.id, input },
			{
				onError: (error) =>
					toast.error(
						error instanceof Error ? error.message : 'Failed to dismiss finding',
					),
				onSuccess: () => {
					setPendingDismissal(null);
					toast.success('Finding dismissed');
				},
			},
		);
	}
	const sorted = sortAudits(filtered, sort);
	const changeSort = (key: AuditSortKey) => {
		setSort((current) => ({
			direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
			key,
		}));
	};

	if (audits.isLoading) {
		return (
			<div className="space-y-4">
				<TabIntro
					description="Run or review the audits available to this project and manage their enabled state."
					title="Audits"
				/>
				<SkeletonRows columns={5} count={6} label="Loading audits…" />
			</div>
		);
	}

	if (audits.isError) {
		return (
			<div className="space-y-4">
				<TabIntro
					description="Run or review the audits available to this project and manage their enabled state."
					title="Audits"
				/>
				<ErrorState
					error={audits.error}
					message="Could not load project audits."
					onRetry={() => void audits.refetch()}
				/>
			</div>
		);
	}

	return (
		<div className={`space-y-4 ${tableColumnClass}`}>
			<TabIntro
				description="Run or review the audits available to this project and manage their enabled state."
				title="Audits"
			/>
			<FilterToolbar
				actionRole="bulk"
				actions={
					<div className="space-y-1.5">
						<div className="flex flex-wrap items-center gap-2">
							<Button
								aria-describedby={
									runDisabledReason ? 'project-audits-run-help' : undefined
								}
								disabled={
									!auditsEnabled ||
									selectedRunnable.length === 0 ||
									launch.isPending
								}
								onClick={() => runSelected(false)}
								variant="primary">
								<Play className="h-4 w-4" />
								Run Selected
							</Button>
							<Button
								aria-describedby={
									runDisabledReason ? 'project-audits-run-help' : undefined
								}
								disabled={
									!auditsEnabled ||
									selectedRunnable.length === 0 ||
									launch.isPending
								}
								onClick={() => runSelected(true)}
								variant="secondary">
								Review Selected
							</Button>
						</div>
						{runDisabledReason ? (
							<p
								className="text-xs text-muted-foreground"
								id="project-audits-run-help">
								{runDisabledReason}
							</p>
						) : null}
					</div>
				}
				activeFilterCount={countActiveFilters(enabledFilter !== 'all')}
				columns="@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_1fr]"
				filtered={filtered.length}
				hasFilters={query.trim() !== '' || enabledFilter !== 'all'}
				header={
					<CardHeader
						badge={
							<Badge tone={auditsEnabled ? 'emerald' : 'red'}>
								<ShieldCheck className="mr-1 h-3 w-3" />
								{auditsEnabled ? 'Audits Enabled' : 'Audits Disabled'}
							</Badge>
						}
						className="mb-0"
						headingLevel={3}
						identifier={`Profile bucket: ${audits.data?.bucket ?? '—'}`}
						title="Audit inventory"
					/>
				}
				mobileLayout="inline"
				noun="audits"
				onReset={resetFilters}
				primaryControlCount={1}
				total={audits.data?.entries.length ?? filtered.length}>
				<FilterSearch
					onChange={setQuery}
					placeholder="Filter audits"
					shortcut
					value={query}
				/>
				<FilterSelect
					label="State"
					onChange={(value) => setEnabledFilter(value as typeof enabledFilter)}
					options={[
						{ label: 'All states', value: 'all' },
						{ label: 'Enabled', value: 'enabled' },
						{ label: 'Disabled', value: 'disabled' },
					]}
					value={enabledFilter}
				/>
			</FilterToolbar>

			<AuditsDesktopTable
				auditsEnabled={auditsEnabled}
				changeOverride={changeOverride}
				dismissPending={dismissFeature.isPending}
				emptyFilters={emptyFilters}
				features={features}
				launchPending={launch.isPending}
				onClearAll={clearAll}
				onDismiss={setPendingDismissal}
				onSelectAll={selectAll}
				onSort={changeSort}
				onToggleSelected={toggleSelected}
				rows={sorted}
				runSingle={runSingle}
				selectableNames={selectableNames}
				selected={selected}
				sort={sort}
				updateOverridesPending={updateOverrides.isPending}
			/>

			<AuditsMobileList
				auditsEnabled={auditsEnabled}
				changeOverride={changeOverride}
				dismissPending={dismissFeature.isPending}
				emptyFilters={emptyFilters}
				features={features}
				launchPending={launch.isPending}
				onClearAll={clearAll}
				onDismiss={setPendingDismissal}
				onSelectAll={selectAll}
				onToggleSelected={toggleSelected}
				rows={sorted}
				runSingle={runSingle}
				selectableNames={selectableNames}
				selected={selected}
				updateOverridesPending={updateOverrides.isPending}
			/>
			{pendingDismissal ? (
				<FindingDismissalDialog
					feature={pendingDismissal}
					isPending={dismissFeature.isPending}
					onClose={() => {
						if (!dismissFeature.isPending) setPendingDismissal(null);
					}}
					onConfirm={confirmDismissal}
				/>
			) : null}
		</div>
	);
}
