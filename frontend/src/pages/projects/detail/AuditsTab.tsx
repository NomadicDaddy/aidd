import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { SkeletonRows } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { fieldLabelClass, selectClass } from '../../../lib/formStyles.ts';
import { AuditsDesktopTable } from './AuditsDesktopTable.tsx';
import { AuditsMobileList } from './AuditsMobileList.tsx';
import { useProjectAuditsTab } from './useProjectAuditsTab.ts';

export function AuditsTab({ projectId, projectName }: { projectId: string; projectName: string }) {
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
		<div className="space-y-4">
			<Card className="flex flex-wrap items-center gap-2">
				<Badge tone={auditsEnabled ? 'emerald' : 'red'}>
					<ShieldCheck className="mr-1 h-3 w-3" />
					{auditsEnabled ? 'Audits Enabled' : 'Audits Disabled'}
				</Badge>
				<span className="mr-auto text-xs text-neutral-500 dark:text-neutral-400">
					Profile bucket: <span className="font-mono">{audits.data?.bucket ?? '—'}</span>
				</span>
				<Button
					aria-describedby={runDisabledReason ? 'project-audits-run-help' : undefined}
					disabled={!auditsEnabled || selectedRunnable.length === 0 || launch.isPending}
					onClick={() => runSelected(false)}
					title={runDisabledReason}>
					<Play className="h-4 w-4" />
					Run Selected
				</Button>
				<Button
					aria-describedby={runDisabledReason ? 'project-audits-run-help' : undefined}
					disabled={!auditsEnabled || selectedRunnable.length === 0 || launch.isPending}
					onClick={() => runSelected(true)}
					title={runDisabledReason}
					variant="secondary">
					Review Selected
				</Button>
				{runDisabledReason ? (
					<span
						className="basis-full text-xs text-neutral-500 dark:text-neutral-400"
						id="project-audits-run-help"
						role="status">
						{runDisabledReason}
					</span>
				) : null}
			</Card>

			<Card className="grid gap-3 md:grid-cols-[2fr_1fr]">
				<label className="space-y-1">
					<span className={fieldLabelClass}>Search</span>
					<div className="relative">
						<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
						<Input
							className="pl-9"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Filter audits"
							value={query}
						/>
					</div>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>State</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setEnabledFilter(event.target.value as typeof enabledFilter)
						}
						value={enabledFilter}>
						<option value="all">All states</option>
						<option value="enabled">Enabled</option>
						<option value="disabled">Disabled</option>
					</select>
				</label>
			</Card>

			<AuditsDesktopTable
				auditsEnabled={auditsEnabled}
				changeOverride={changeOverride}
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
