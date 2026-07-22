/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { SkeletonRows } from '../../../components/shared/LoadingState.tsx';
import {
	useAuditDefinition,
	useAuditManager,
	useLaunchAudits,
	useSaveAuditDefinition,
} from '../../../hooks/useAudits.ts';
import { useSettingsConfig, useUpdateSettingsConfig } from '../../../hooks/useSettings.ts';
import {
	clearVisibleAudits as clearVisibleAuditsHelper,
	deriveVisibleSelection,
	selectVisibleAudits as selectVisibleAuditsHelper,
	toggleAuditSelected as toggleAuditSelectedHelper,
} from '../auditSelection.ts';
import { type HealthFilter, healthFor } from '../auditsUtils.ts';
import { CatalogSidePanel } from './CatalogSidePanel.tsx';
import { CatalogTable } from './CatalogTable.tsx';
import { CatalogToolbar } from './CatalogToolbar.tsx';

export function CatalogTab({ onJumpToMatrix }: { onJumpToMatrix: () => void }) {
	const manager = useAuditManager();
	const settings = useSettingsConfig();
	const updateSettings = useUpdateSettingsConfig();
	const launch = useLaunchAudits();
	const save = useSaveAuditDefinition();
	const [selectedAudit, setSelectedAudit] = useState<null | string>(null);
	const [selectedAuditNames, setSelectedAuditNames] = useState<string[]>([]);
	const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
	const [query, setQuery] = useState('');
	const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
	const [enabledFilter, setEnabledFilter] = useState<'all' | 'disabled' | 'enabled'>('all');
	const [content, setContent] = useState('');
	const definition = useAuditDefinition(selectedAudit);

	const lower = query.trim().toLowerCase();
	// Memoize the filtered+sorted list so its reference stays stable across renders and downstream
	// name-set memos keyed on filteredDefinitions can cache without retriggering their effects.
	const filteredDefinitions = useMemo(() => {
		const matching = (manager.data?.definitions ?? []).filter((item) => {
			if (lower && !`${item.name} ${item.path}`.toLowerCase().includes(lower)) return false;
			if (healthFilter !== 'all' && healthFor(item) !== healthFilter) return false;
			if (enabledFilter === 'enabled' && !item.enabled) return false;
			if (enabledFilter === 'disabled' && item.enabled) return false;
			return true;
		});
		return matching.sort((left, right) => {
			const leftScore = left.changePotential?.score ?? -1;
			const rightScore = right.changePotential?.score ?? -1;
			if (leftScore !== rightScore) return rightScore - leftScore;
			return left.name.localeCompare(right.name);
		});
	}, [manager.data?.definitions, lower, healthFilter, enabledFilter]);

	const filteredNames = useMemo(
		() => new Set(filteredDefinitions.map((d) => d.name)),
		[filteredDefinitions]
	);
	const enabledDefinitionNames = useMemo(
		() =>
			new Set(
				(manager.data?.definitions ?? [])
					.filter((item) => item.enabled)
					.map((item) => item.name)
			),
		[manager.data?.definitions]
	);
	const visibleEnabledNames = useMemo(
		() => filteredDefinitions.filter((item) => item.enabled).map((item) => item.name),
		[filteredDefinitions]
	);
	const selectedRunnableAuditNames = selectedAuditNames.filter((name) =>
		enabledDefinitionNames.has(name)
	);
	const { allSelected: allVisibleAuditsSelected, someSelected: someVisibleAuditsSelected } =
		deriveVisibleSelection(visibleEnabledNames, selectedAuditNames);

	// Auto-select the first definition when none is selected yet.
	useEffect(() => {
		if (selectedAudit !== null) return;
		const first = manager.data?.definitions[0]?.name;
		if (first) setSelectedAudit(first);
	}, [manager.data?.definitions, selectedAudit]);

	// Reconcile selection with the current filter: if the selected audit is no
	// longer visible, clear it (and auto-select the sole match when exactly one
	// row remains).
	useEffect(() => {
		if (selectedAudit === null) return;
		if (filteredNames.has(selectedAudit)) return;
		if (filteredDefinitions.length === 1) {
			const sole = filteredDefinitions[0];
			if (sole) setSelectedAudit(sole.name);
		} else {
			setSelectedAudit(null);
		}
	}, [filteredDefinitions, filteredNames, selectedAudit]);

	useEffect(() => {
		if (definition.data?.content !== undefined) setContent(definition.data.content);
	}, [definition.data?.content]);

	// Prune any selected names that are no longer enabled, reusing the already
	// derived enabledDefinitionNames set rather than recomputing it inline.
	useEffect(() => {
		setSelectedAuditNames((current) =>
			current.filter((name) => enabledDefinitionNames.has(name))
		);
	}, [enabledDefinitionNames]);

	// When the selected audit is cleared (e.g. by a filter), reset the editor
	// content so the textarea and heading don't show stale text from a
	// previously selected audit that is no longer visible.
	useEffect(() => {
		if (selectedAudit === null) setContent('');
	}, [selectedAudit]);

	const auditsEnabled = manager.data?.auditsEnabled ?? settings.data?.auditsEnabled ?? true;
	const selectedProjectCount = selectedProjectIds.length;
	const dirty = definition.data?.content !== undefined && content !== definition.data.content;
	const runAllDisabledReason = !auditsEnabled
		? 'Audits are currently disabled. Enable audits to launch runs.'
		: selectedProjectCount === 0
			? 'Select at least one launch target below to enable run actions.'
			: launch.isPending
				? 'A launch is already in progress…'
				: undefined;
	const runSelectedDisabledReason =
		runAllDisabledReason ??
		(selectedRunnableAuditNames.length === 0
			? 'Select one or more enabled audits to run.'
			: undefined);

	function toggleProject(id: string) {
		setSelectedProjectIds((current) =>
			current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
		);
	}

	function toggleAuditSelected(name: string) {
		setSelectedAuditNames((current) =>
			toggleAuditSelectedHelper(current, name, enabledDefinitionNames)
		);
	}

	function selectVisibleAudits() {
		setSelectedAuditNames((current) => selectVisibleAuditsHelper(current, visibleEnabledNames));
	}

	function clearVisibleAudits() {
		setSelectedAuditNames((current) => clearVisibleAuditsHelper(current, visibleEnabledNames));
	}

	function toggleAuditsEnabled() {
		if (!settings.data) return;
		updateSettings.mutate(
			{ ...settings.data, auditsEnabled: !auditsEnabled },
			{
				onError: (error) =>
					toast.error(error instanceof Error ? error.message : 'Could not update audits'),
				onSuccess: () => {
					void manager.refetch();
					toast.success(!auditsEnabled ? 'Audits enabled' : 'Audits disabled');
				},
			}
		);
	}

	function runAudits(review: boolean, auditAll = false) {
		if (!auditAll && selectedRunnableAuditNames.length === 0) return;
		launch.mutate(
			{
				auditAll,
				auditNames: auditAll ? [] : selectedRunnableAuditNames,
				projectIds: selectedProjectIds,
				review,
			},
			{
				onError: (error) =>
					toast.error(error instanceof Error ? error.message : 'Could not launch audits'),
				onSuccess: (result) => {
					if (result.runIds.length > 0) {
						toast.success(
							`Launched ${result.runIds.length} run${result.runIds.length === 1 ? '' : 's'}`
						);
					}
					if (result.failures.length > 0) {
						toast.error('Some audit launches failed', {
							description: result.failures.slice(0, 2).join(' | '),
						});
					}
				},
			}
		);
	}

	function saveDefinition() {
		if (!selectedAudit) return;
		save.mutate(
			{ content, name: selectedAudit },
			{
				onError: (error) =>
					toast.error(error instanceof Error ? error.message : 'Could not save audit'),
				onSuccess: () => toast.success('Audit definition saved'),
			}
		);
	}

	const definitions = manager.data?.definitions ?? [];

	if (manager.isLoading && definitions.length === 0) {
		return <SkeletonRows columns={5} count={8} label="Loading audits…" />;
	}

	if (manager.isError) {
		return (
			<ErrorState
				error={manager.error}
				message="Could not load audits."
				onRetry={() => void manager.refetch()}
			/>
		);
	}

	return (
		<div className="space-y-5">
			<CatalogToolbar
				auditsEnabled={auditsEnabled}
				enabledFilter={enabledFilter}
				healthFilter={healthFilter}
				onEnabledFilterChange={setEnabledFilter}
				onHealthFilterChange={setHealthFilter}
				onQueryChange={setQuery}
				onRun={runAudits}
				onToggleAuditsEnabled={toggleAuditsEnabled}
				query={query}
				runAllDisabledReason={runAllDisabledReason}
				runSelectedDisabledReason={runSelectedDisabledReason}
				selectedAuditCount={selectedRunnableAuditNames.length}
				settingsReady={Boolean(settings.data)}
				updatePending={updateSettings.isPending}
			/>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
				<CatalogTable
					allSelected={allVisibleAuditsSelected}
					definitions={filteredDefinitions}
					onClearAll={clearVisibleAudits}
					onJumpToMatrix={onJumpToMatrix}
					onSelect={setSelectedAudit}
					onSelectAll={selectVisibleAudits}
					onToggleSelected={toggleAuditSelected}
					selectedAudit={selectedAudit}
					selectedAuditNames={selectedAuditNames}
					someSelected={someVisibleAuditsSelected}
				/>

				<CatalogSidePanel
					auditPath={definition.data?.path}
					content={content}
					dirty={dirty}
					onContentChange={setContent}
					onSave={saveDefinition}
					onToggleProject={toggleProject}
					projects={manager.data?.projects ?? []}
					savePending={save.isPending}
					selectedAudit={selectedAudit}
					selectedProjectIds={selectedProjectIds}
				/>
			</div>
		</div>
	);
}
