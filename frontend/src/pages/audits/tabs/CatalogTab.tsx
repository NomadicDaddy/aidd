/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { SkeletonRows } from '../../../components/shared/LoadingState.tsx';
import {
	useAuditDefinition,
	useAuditManager,
	useSaveAuditDefinition,
} from '../../../hooks/useAudits.ts';
import { useSettingsConfig, useUpdateSettingsConfig } from '../../../hooks/useSettings.ts';
import {
	clearVisibleAudits as clearVisibleAuditsHelper,
	deriveVisibleSelection,
	selectVisibleAudits as selectVisibleAuditsHelper,
	toggleAuditSelected as toggleAuditSelectedHelper,
} from '../auditSelection.ts';
import { auditCatalogListId, type HealthFilter } from '../auditsUtils.ts';
import {
	type CatalogSort,
	type CatalogSortKey,
	defaultCatalogSort,
	filterAndSortCatalog,
	nextCatalogSort,
} from '../catalogSort.ts';
import { AuditDefinitionEditor } from './AuditDefinitionEditor.tsx';
import { CatalogSelectionDialog } from './CatalogSelectionDialog.tsx';
import { CatalogTable } from './CatalogTable.tsx';
import { CatalogToolbar } from './CatalogToolbar.tsx';
import { LaunchTargetsCard } from './LaunchTargetsCard.tsx';
import { useCatalogAuditLauncher } from './useCatalogAuditLauncher.ts';
import { useCatalogMobileNavigation } from './useCatalogMobileNavigation.ts';

export function CatalogTab({ onJumpToMatrix }: { onJumpToMatrix: () => void }) {
	const manager = useAuditManager();
	const settings = useSettingsConfig();
	const updateSettings = useUpdateSettingsConfig();
	const save = useSaveAuditDefinition();
	const [selectedAudit, setSelectedAudit] = useState<null | string>(null);
	const [selectedAuditNames, setSelectedAuditNames] = useState<string[]>([]);
	const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
	const [query, setQuery] = useState('');
	const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
	const [enabledFilter, setEnabledFilter] = useState<'all' | 'disabled' | 'enabled'>('all');
	const [sort, setSort] = useState<CatalogSort>(defaultCatalogSort);
	const [launchTargetsOpen, setLaunchTargetsOpen] = useState(false);
	const [content, setContent] = useState('');
	const selectionInitializedRef = useRef(false);
	const definition = useAuditDefinition(selectedAudit);

	const lower = query.trim().toLowerCase();
	const filteredDefinitions = useMemo(
		() =>
			filterAndSortCatalog(manager.data?.definitions ?? [], {
				enabledFilter,
				healthFilter,
				query: lower,
				sort,
			}),
		[manager.data?.definitions, lower, healthFilter, enabledFilter, sort],
	);

	const filteredNames = useMemo(
		() => new Set(filteredDefinitions.map((d) => d.name)),
		[filteredDefinitions],
	);
	const enabledDefinitionNames = useMemo(
		() =>
			new Set(
				(manager.data?.definitions ?? [])
					.filter((item) => item.enabled)
					.map((item) => item.name),
			),
		[manager.data?.definitions],
	);
	const visibleEnabledNames = useMemo(
		() => filteredDefinitions.filter((item) => item.enabled).map((item) => item.name),
		[filteredDefinitions],
	);
	const selectedRunnableAuditNames = selectedAuditNames.filter((name) =>
		enabledDefinitionNames.has(name),
	);
	const { launch, runAudits } = useCatalogAuditLauncher({
		projectIds: selectedProjectIds,
		selectedAuditNames: selectedRunnableAuditNames,
	});
	const { allSelected: allVisibleAuditsSelected, someSelected: someVisibleAuditsSelected } =
		deriveVisibleSelection(visibleEnabledNames, selectedAuditNames);

	useEffect(() => {
		if (selectionInitializedRef.current || selectedAudit !== null) return;
		const first = manager.data?.definitions[0]?.name;
		if (!first) return;
		selectionInitializedRef.current = true;
		setSelectedAudit(first);
	}, [manager.data?.definitions, selectedAudit]);

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
		if (definition.data?.name !== selectedAudit || definition.data.content === undefined)
			return;
		setContent(definition.data.content);
	}, [definition.data?.content, definition.data?.name, selectedAudit]);

	useEffect(() => {
		setSelectedAuditNames((current) =>
			current.filter((name) => enabledDefinitionNames.has(name)),
		);
	}, [enabledDefinitionNames]);

	useEffect(() => {
		if (selectedAudit === null) setContent('');
	}, [selectedAudit]);

	const auditsEnabled = manager.data?.auditsEnabled ?? settings.data?.auditsEnabled ?? true;
	const selectedProjectCount = selectedProjectIds.length;
	const selectedProjectPath =
		selectedProjectCount === 1
			? manager.data?.projects.find((project) => project.id === selectedProjectIds[0])?.path
			: undefined;
	const activeDefinition = definition.data?.name === selectedAudit ? definition.data : undefined;
	const dirty = activeDefinition?.content !== undefined && content !== activeDefinition.content;
	const {
		cancelSelection,
		catalogRef,
		confirmSelection,
		pendingAudit,
		returnToCatalog,
		selectAudit,
		showEditor,
	} = useCatalogMobileNavigation({
		dirty,
		onSelectAudit: setSelectedAudit,
		selectedAudit,
	});
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
			current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
		);
	}

	function toggleAuditSelected(name: string) {
		setSelectedAuditNames((current) =>
			toggleAuditSelectedHelper(current, name, enabledDefinitionNames),
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
			},
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
			},
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
				filteredCount={filteredDefinitions.length}
				healthFilter={healthFilter}
				launchTargets={
					<LaunchTargetsCard
						onOpenChange={setLaunchTargetsOpen}
						onToggleProject={toggleProject}
						open={launchTargetsOpen}
						projects={manager.data?.projects ?? []}
						selectedProjectIds={selectedProjectIds}
					/>
				}
				onEnabledFilterChange={setEnabledFilter}
				onHealthFilterChange={setHealthFilter}
				onQueryChange={setQuery}
				onRun={runAudits}
				onToggleAuditsEnabled={toggleAuditsEnabled}
				query={query}
				runAllDisabledReason={runAllDisabledReason}
				runLaunchPending={launch.isPending}
				runSelectedDisabledReason={runSelectedDisabledReason}
				selectedAuditCount={selectedRunnableAuditNames.length}
				selectedProjectPath={selectedProjectPath}
				settingsReady={Boolean(settings.data)}
				totalCount={manager.data?.definitions.length ?? 0}
				updatePending={updateSettings.isPending}
			/>

			<div
				aria-label="Audit catalog list"
				className={showEditor ? 'hidden xl:block' : undefined}
				id={auditCatalogListId}
				ref={catalogRef}
				role="region"
				tabIndex={-1}>
				<CatalogTable
					allSelected={allVisibleAuditsSelected}
					definitions={filteredDefinitions}
					onClearAll={clearVisibleAudits}
					onJumpToMatrix={onJumpToMatrix}
					onSelect={selectAudit}
					onSelectAll={selectVisibleAudits}
					onSort={(key: CatalogSortKey) =>
						setSort((current) => nextCatalogSort(current, key))
					}
					onToggleSelected={toggleAuditSelected}
					selectedAudit={selectedAudit}
					selectedAuditNames={selectedAuditNames}
					someSelected={someVisibleAuditsSelected}
					sort={sort}
				/>
			</div>

			<div className={showEditor ? undefined : 'hidden xl:block'}>
				<AuditDefinitionEditor
					auditPath={activeDefinition?.path}
					content={activeDefinition ? content : ''}
					dirty={dirty}
					onContentChange={setContent}
					onReturnToCatalog={returnToCatalog}
					onSave={saveDefinition}
					savePending={save.isPending}
					selectedAudit={selectedAudit}
				/>
			</div>
			<CatalogSelectionDialog
				onCancel={cancelSelection}
				onConfirm={confirmSelection}
				pendingAudit={pendingAudit}
			/>
		</div>
	);
}
