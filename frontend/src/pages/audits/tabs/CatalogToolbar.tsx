import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { type ReactNode, useState } from 'react';

import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';
import type { HealthFilter } from '../auditsUtils.ts';

import { FilterSearch, FilterSelect } from '../../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../../components/shared/FilterToolbar.tsx';
import { LaunchTargetControl } from '../../../components/shared/LaunchTargetControl.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { countActiveFilters } from '../../../lib/filterFields.ts';
import { microLabelClass } from '../../../lib/typography.ts';

type EnabledFilter = 'all' | 'disabled' | 'enabled';

interface CatalogToolbarProps {
	auditsEnabled: boolean;
	enabledFilter: EnabledFilter;
	filteredCount: number;
	healthFilter: HealthFilter;
	/** The launch-target disclosure, rendered inside the actions card whose buttons it gates. */
	launchTargets: ReactNode;
	onEnabledFilterChange: (value: EnabledFilter) => void;
	onHealthFilterChange: (value: HealthFilter) => void;
	onQueryChange: (value: string) => void;
	/** Owned by `useCatalogFilters`, so the toolbar and the empty state clear the same values. */
	onReset: () => void;
	onRun: (
		review: boolean,
		auditAll: boolean | undefined,
		launchTarget: LaunchTargetValue,
	) => void;
	onToggleAuditsEnabled: () => void;
	query: string;
	runAllDisabledReason: string | undefined;
	runLaunchPending: boolean;
	runSelectedDisabledReason: string | undefined;
	selectedAuditCount: number;
	selectedProjectPath: string | undefined;
	settingsReady: boolean;
	totalCount: number;
	updatePending: boolean;
}

export function CatalogToolbar({
	auditsEnabled,
	enabledFilter,
	filteredCount,
	healthFilter,
	launchTargets,
	onEnabledFilterChange,
	onHealthFilterChange,
	onQueryChange,
	onReset,
	onRun,
	onToggleAuditsEnabled,
	query,
	runAllDisabledReason,
	runLaunchPending,
	runSelectedDisabledReason,
	selectedAuditCount,
	selectedProjectPath,
	settingsReady,
	totalCount,
	updatePending,
}: CatalogToolbarProps) {
	const [runTarget, setRunTarget] = useState<LaunchTargetValue>({});
	const [reviewTarget, setReviewTarget] = useState<LaunchTargetValue>({});
	const runSelectedDisabled = Boolean(runSelectedDisabledReason);
	const runAllDisabled = Boolean(runAllDisabledReason);
	const selectedDescribedBy = runSelectedDisabledReason
		? 'audits-run-selected-disabled-help'
		: undefined;
	const allDescribedBy = runAllDisabledReason
		? runAllDisabledReason === runSelectedDisabledReason
			? selectedDescribedBy
			: 'audits-run-all-disabled-help'
		: undefined;
	const targetDefaults = selectedProjectPath ? 'resolved' : 'per-project';
	const projectTargetProps = selectedProjectPath ? { projectDir: selectedProjectPath } : {};
	return (
		<FilterToolbar
			actionLayout="stacked"
			actionRole="bulk"
			actions={
				<div className="flex max-w-full flex-wrap items-start justify-end gap-3">
					{/* Three clusters, not six peers: the global toggle, everything that runs an
					    audit, and everything that reviews one. Each launch-target picker reads as
					    bound to the buttons beside it, and a cluster wraps as a unit instead of
					    shedding one button. */}
					<div className="flex flex-col items-start gap-1.5 border-border pr-3 sm:border-r">
						<span className={`text-muted-foreground ${microLabelClass}`}>
							Audit availability
						</span>
						<Button
							disabled={updatePending || !settingsReady}
							onClick={onToggleAuditsEnabled}
							variant={auditsEnabled ? 'secondary' : 'danger'}>
							<ShieldCheck className="h-4 w-4" />
							{auditsEnabled ? 'Audits Enabled' : 'Audits Disabled'}
						</Button>
					</div>
					<div className="flex min-w-0 flex-col items-start gap-1.5 rounded-lg bg-muted px-2 py-1.5">
						<span className={`text-muted-foreground ${microLabelClass}`}>
							Run audits
						</span>
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							<LaunchTargetControl
								defaultScope={targetDefaults}
								disabled={runLaunchPending}
								label="Run"
								mode="audit"
								onChange={setRunTarget}
								size="default"
								value={runTarget}
								{...projectTargetProps}
							/>
							<Button
								aria-describedby={selectedDescribedBy}
								disabled={runSelectedDisabled}
								onClick={() => onRun(false, undefined, runTarget)}
								variant="primary">
								<Play className="h-4 w-4" />
								Run Selected
								{selectedAuditCount > 0 ? ` (${selectedAuditCount})` : ''}
							</Button>
							<Button
								aria-describedby={allDescribedBy}
								disabled={runAllDisabled}
								onClick={() => onRun(false, true, runTarget)}
								variant="secondary">
								Run All
							</Button>
						</div>
					</div>
					<div className="flex min-w-0 flex-col items-start gap-1.5 rounded-lg bg-muted px-2 py-1.5">
						<span className={`text-muted-foreground ${microLabelClass}`}>
							Review audits
						</span>
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							<LaunchTargetControl
								defaultScope={targetDefaults}
								disabled={runLaunchPending}
								label="Review"
								mode="directive"
								onChange={setReviewTarget}
								size="default"
								value={reviewTarget}
								{...projectTargetProps}
							/>
							<Button
								aria-describedby={selectedDescribedBy}
								disabled={runSelectedDisabled}
								onClick={() => onRun(true, undefined, reviewTarget)}
								variant="secondary">
								Review Selected
								{selectedAuditCount > 0 ? ` (${selectedAuditCount})` : ''}
							</Button>
						</div>
					</div>
					{runSelectedDisabledReason ? (
						<span
							className="basis-full text-xs text-muted-foreground"
							id="audits-run-selected-disabled-help"
							role="status">
							{runSelectedDisabledReason}
						</span>
					) : null}
					{runAllDisabledReason && runAllDisabledReason !== runSelectedDisabledReason ? (
						<span
							className="basis-full text-xs text-muted-foreground"
							id="audits-run-all-disabled-help"
							role="status">
							{runAllDisabledReason}
						</span>
					) : null}
				</div>
			}
			activeFilterCount={countActiveFilters(enabledFilter !== 'all', healthFilter !== 'all')}
			columns="@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_1fr_1fr]"
			filtered={filteredCount}
			hasFilters={query.trim() !== '' || healthFilter !== 'all' || enabledFilter !== 'all'}
			header={launchTargets}
			noun="audits"
			onReset={onReset}
			primaryControlCount={1}
			total={totalCount}>
			<FilterSearch
				onChange={onQueryChange}
				placeholder="Filter audits"
				shortcut
				value={query}
			/>
			{/* State before Health, matching the project's own Audits tab: that tab has only
			    Search and State, and the two read as the same toolbar when State is in the
			    same place in both. */}
			<FilterSelect
				label="State"
				onChange={(value) => onEnabledFilterChange(value as EnabledFilter)}
				options={[
					{ label: 'All states', value: 'all' },
					{ label: 'Enabled', value: 'enabled' },
					{ label: 'Disabled', value: 'disabled' },
				]}
				value={enabledFilter}
			/>
			<FilterSelect
				label="Health"
				onChange={(value) => onHealthFilterChange(value as HealthFilter)}
				options={[
					{ label: 'All health', value: 'all' },
					{ label: 'Fresh', value: 'fresh' },
					{ label: 'Missing reports', value: 'missing' },
					{ label: 'No applicable projects', value: 'not-applicable' },
					{ label: 'Stale reports', value: 'stale' },
				]}
				value={healthFilter}
			/>
		</FilterToolbar>
	);
}
