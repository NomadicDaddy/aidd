import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';

import type { HealthFilter } from '../auditsUtils.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { fieldLabelClass, selectClass } from '../../../lib/formStyles.ts';

type EnabledFilter = 'all' | 'disabled' | 'enabled';

interface CatalogToolbarProps {
	auditsEnabled: boolean;
	enabledFilter: EnabledFilter;
	healthFilter: HealthFilter;
	onEnabledFilterChange: (value: EnabledFilter) => void;
	onHealthFilterChange: (value: HealthFilter) => void;
	onQueryChange: (value: string) => void;
	onRun: (review: boolean, auditAll?: boolean) => void;
	onToggleAuditsEnabled: () => void;
	query: string;
	runAllDisabledReason: string | undefined;
	runSelectedDisabledReason: string | undefined;
	selectedAuditCount: number;
	settingsReady: boolean;
	updatePending: boolean;
}

export function CatalogToolbar({
	auditsEnabled,
	enabledFilter,
	healthFilter,
	onEnabledFilterChange,
	onHealthFilterChange,
	onQueryChange,
	onRun,
	onToggleAuditsEnabled,
	query,
	runAllDisabledReason,
	runSelectedDisabledReason,
	selectedAuditCount,
	settingsReady,
	updatePending,
}: CatalogToolbarProps) {
	const runSelectedDisabled = Boolean(runSelectedDisabledReason);
	const runAllDisabled = Boolean(runAllDisabledReason);
	const selectedDescribedBy = runSelectedDisabledReason
		? 'audits-run-selected-disabled-help'
		: undefined;
	const allDescribedBy = runAllDisabledReason ? 'audits-run-all-disabled-help' : undefined;
	return (
		<>
			<Card className="flex flex-wrap items-center gap-2">
				<Button
					disabled={updatePending || !settingsReady}
					onClick={onToggleAuditsEnabled}
					variant={auditsEnabled ? 'secondary' : 'danger'}>
					<ShieldCheck className="h-4 w-4" />
					{auditsEnabled ? 'Audits Enabled' : 'Audits Disabled'}
				</Button>
				<Button
					aria-describedby={selectedDescribedBy}
					disabled={runSelectedDisabled}
					onClick={() => onRun(false)}
					title={runSelectedDisabledReason}>
					<Play className="h-4 w-4" />
					Run Selected{selectedAuditCount > 0 ? ` (${selectedAuditCount})` : ''}
				</Button>
				<Button
					aria-describedby={allDescribedBy}
					disabled={runAllDisabled}
					onClick={() => onRun(false, true)}
					title={runAllDisabledReason}
					variant="secondary">
					Run All
				</Button>
				<Button
					aria-describedby={selectedDescribedBy}
					disabled={runSelectedDisabled}
					onClick={() => onRun(true)}
					title={runSelectedDisabledReason}
					variant="secondary">
					Review Selected{selectedAuditCount > 0 ? ` (${selectedAuditCount})` : ''}
				</Button>
				{runSelectedDisabledReason ? (
					<span
						className="basis-full text-xs text-neutral-500 dark:text-neutral-400"
						id="audits-run-selected-disabled-help"
						role="status">
						{runSelectedDisabledReason}
					</span>
				) : null}
				{runAllDisabledReason && runAllDisabledReason !== runSelectedDisabledReason ? (
					<span
						className="basis-full text-xs text-neutral-500 dark:text-neutral-400"
						id="audits-run-all-disabled-help"
						role="status">
						{runAllDisabledReason}
					</span>
				) : null}
			</Card>

			<Card className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr]">
				<label className="space-y-1">
					<span className={fieldLabelClass}>Search</span>
					<div className="relative">
						<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
						<Input
							className="pl-9"
							data-shortcut-search=""
							onChange={(event) => onQueryChange(event.target.value)}
							placeholder="Filter audits"
							value={query}
						/>
					</div>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Health</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							onHealthFilterChange(event.target.value as HealthFilter)
						}
						value={healthFilter}>
						<option value="all">All health</option>
						<option value="fresh">Fresh</option>
						<option value="missing">Missing reports</option>
						<option value="stale">Stale reports</option>
					</select>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>State</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							onEnabledFilterChange(event.target.value as EnabledFilter)
						}
						value={enabledFilter}>
						<option value="all">All states</option>
						<option value="enabled">Enabled</option>
						<option value="disabled">Disabled</option>
					</select>
				</label>
			</Card>
		</>
	);
}
