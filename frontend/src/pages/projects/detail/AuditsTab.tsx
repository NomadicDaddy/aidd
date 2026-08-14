import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';

import type { ProjectFeature } from '../../../api/types.ts';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import {
	FilterSearch,
	FilterSelect,
	FilterToolbar,
} from '../../../components/shared/FilterToolbar.tsx';
import { SkeletonRows } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { tableMeasureClass } from '../../../lib/tableStyles.ts';
import { AuditsDesktopTable } from './AuditsDesktopTable.tsx';
import { AuditsMobileList } from './AuditsMobileList.tsx';
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

	if (audits.isLoading) {
		return <SkeletonRows columns={5} count={6} label="Loading audits…" />;
	}

	if (audits.isError) {
		return (
			<ErrorState
				error={audits.error}
				message="Could not load project audits."
				onRetry={() => void audits.refetch()}
			/>
		);
	}

	return (
		<div className={`space-y-4 ${tableMeasureClass}`}>
			<Card>
				<CardHeader
					action={
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
								title={runDisabledReason}>
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
								title={runDisabledReason}
								variant="secondary">
								Review Selected
							</Button>
						</div>
					}
					actionLayout="stacked"
					badge={
						<Badge tone={auditsEnabled ? 'emerald' : 'red'}>
							<ShieldCheck className="mr-1 h-3 w-3" />
							{auditsEnabled ? 'Audits Enabled' : 'Audits Disabled'}
						</Badge>
					}
					className="mb-0"
					description={
						<>
							Profile bucket:{' '}
							<span className="font-mono">{audits.data?.bucket ?? '—'}</span>
						</>
					}
					title="Audits"
				/>
				{runDisabledReason ? (
					<span
						className="mt-2 block text-xs text-muted-foreground"
						id="project-audits-run-help"
						role="status">
						{runDisabledReason}
					</span>
				) : null}
			</Card>

			<FilterToolbar
				columns="sm:grid-cols-2 xl:grid-cols-[2fr_1fr]"
				filtered={filtered.length}
				hasFilters={query.trim() !== '' || enabledFilter !== 'all'}
				noun="audits"
				onReset={() => {
					setQuery('');
					setEnabledFilter('all');
				}}
				total={audits.data?.entries.length ?? filtered.length}>
				<FilterSearch onChange={setQuery} placeholder="Filter audits" value={query} />
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
				features={features}
				launchPending={launch.isPending}
				onClearAll={clearAll}
				onSelectAll={selectAll}
				onToggleSelected={toggleSelected}
				rows={filtered}
				runSingle={runSingle}
				selectableNames={selectableNames}
				selected={selected}
				updateOverridesPending={updateOverrides.isPending}
			/>

			<AuditsMobileList
				auditsEnabled={auditsEnabled}
				changeOverride={changeOverride}
				features={features}
				launchPending={launch.isPending}
				onClearAll={clearAll}
				onSelectAll={selectAll}
				onToggleSelected={toggleSelected}
				rows={filtered}
				runSingle={runSingle}
				selectableNames={selectableNames}
				selected={selected}
				updateOverridesPending={updateOverrides.isPending}
			/>
		</div>
	);
}
