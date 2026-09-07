/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type {
	AuditEffect,
	AuditOverrideEffect,
	AuditProfileOverrides,
} from '../../../api/types.ts';

import { CommitBar, commitBarClearanceClass } from '../../../components/shared/CommitBar.tsx';
import { ConfirmDialog } from '../../../components/shared/ConfirmDialog.tsx';
import { FilterSearch, FilterSelect } from '../../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../../components/shared/FilterToolbar.tsx';
import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { CardHeader } from '../../../components/ui/card.tsx';
import {
	useAuditManager,
	useAuditProfileMapping,
	useProjectAuditOverrides,
	useProjectAudits,
	useUpdateProjectAuditOverrides,
} from '../../../hooks/useAudits.ts';
import { countActiveFilters, filterRegister } from '../../../lib/filterFields.ts';
import { countChangedEffects, seedAudits } from './overridesFormState.ts';
import { OverridesList } from './OverridesList.tsx';
import { OverridesRulesCard } from './OverridesRulesCard.tsx';

type OverridesStateFilter = 'all' | 'default' | 'overridden' | 'pending';

const overrideStateOptions: readonly { label: string; value: OverridesStateFilter }[] = [
	{ label: 'All states', value: 'all' },
	{ label: 'Overridden', value: 'overridden' },
	{ label: 'Pending', value: 'pending' },
	{ label: 'Default', value: 'default' },
];

export function OverridesTab() {
	const manager = useAuditManager();
	const [projectId, setProjectId] = useState<null | string>(null);
	const [pendingProjectId, setPendingProjectId] = useState<null | string | undefined>(undefined);
	const overrides = useProjectAuditOverrides(projectId);
	const projectAudits = useProjectAudits(projectId);
	const profileMapping = useAuditProfileMapping();
	const update = useUpdateProjectAuditOverrides();
	const [audits, setAudits] = useState<Record<string, 'default' | AuditOverrideEffect>>({});
	const [rulesText, setRulesText] = useState('[]');
	const [rulesError, setRulesError] = useState<null | string>(null);
	const [query, setQuery] = useState('');
	const [stateFilter, setStateFilter] = useState<OverridesStateFilter>('all');
	function resetFilters(): void {
		setQuery('');
		setStateFilter('all');
	}
	const emptyFilters = filterRegister(resetFilters, [
		query.trim() !== '' && { label: 'Search', value: query.trim() },
		stateFilter !== 'all' && {
			label: 'State',
			value:
				overrideStateOptions.find((option) => option.value === stateFilter)?.label ??
				stateFilter,
		},
	]);

	useEffect(() => {
		if (!manager.data?.projects.length) return;
		if (projectId === null) setProjectId(manager.data.projects[0]?.id ?? null);
	}, [manager.data?.projects, projectId]);

	useEffect(() => {
		if (!overrides.data) return;
		setAudits(seedAudits(manager.data?.definitions ?? [], overrides.data.audits));
		setRulesText(JSON.stringify(overrides.data.rules, null, 2));
		setRulesError(null);
	}, [manager.data?.definitions, overrides.data]);

	const explicitAudits = ((): Record<string, AuditOverrideEffect> => {
		const explicit: Record<string, AuditOverrideEffect> = {};
		for (const [name, effect] of Object.entries(audits)) {
			if (effect === 'default') continue;
			explicit[name] = effect;
		}
		return explicit;
	})();

	const rulesDirty =
		overrides.data !== undefined && rulesText !== JSON.stringify(overrides.data.rules, null, 2);
	const dirtyChangeCount =
		overrides.data === undefined
			? 0
			: countChangedEffects(explicitAudits, overrides.data.audits) + (rulesDirty ? 1 : 0);
	const dirty = dirtyChangeCount > 0;
	const overriddenCount = Object.keys(explicitAudits).length;
	const definitions = manager.data?.definitions ?? [];
	const dirtyAuditNames = new Set(
		definitions
			.filter(
				(definition) =>
					(explicitAudits[definition.name] ?? 'default') !==
					(overrides.data?.audits[definition.name] ?? 'default'),
			)
			.map((definition) => definition.name),
	);
	const selectedProjectName = manager.data?.projects.find(
		(project) => project.id === projectId,
	)?.name;
	const pendingProjectName = manager.data?.projects.find(
		(project) => project.id === pendingProjectId,
	)?.name;
	const inheritedEffects: Record<string, AuditEffect> = {};
	if (profileMapping.data && projectAudits.data) {
		for (const row of profileMapping.data.matrix) {
			inheritedEffects[row.auditName] = row.byBucket[projectAudits.data.bucket].effect;
		}
	}
	const recordedUpdatedAt =
		overrides.data && Date.parse(overrides.data.updatedAt) > 0
			? overrides.data.updatedAt
			: null;

	const lower = query.trim().toLowerCase();
	const visibleDefinitions = definitions.filter((definition) => {
		if (lower && !definition.name.toLowerCase().includes(lower)) return false;
		const overridden = (audits[definition.name] ?? 'default') !== 'default';
		if (stateFilter === 'overridden' && !overridden) return false;
		if (stateFilter === 'default' && overridden) return false;
		if (stateFilter === 'pending' && !dirtyAuditNames.has(definition.name)) return false;
		return true;
	});

	function applyOverrides() {
		if (!projectId) return;
		let parsedRules: AuditProfileOverrides['rules'];
		try {
			parsedRules = JSON.parse(rulesText) as AuditProfileOverrides['rules'];
		} catch (error) {
			setRulesError(error instanceof Error ? error.message : 'Invalid JSON');
			return;
		}
		setRulesError(null);
		update.mutate(
			{
				overrides: {
					audits: explicitAudits,
					rules: parsedRules,
					updatedAt: new Date().toISOString(),
					version: 1,
				},
				projectId,
			},
			{
				onError: (error) =>
					toast.error(
						error instanceof Error ? error.message : 'Could not save overrides',
					),
				onSuccess: () => toast.success('Project overrides saved'),
			},
		);
	}

	function changeProject(value: string): void {
		const nextProjectId = value || null;
		if (nextProjectId === projectId) return;
		if (dirty) {
			setPendingProjectId(nextProjectId);
			return;
		}
		setProjectId(nextProjectId);
	}

	function discardOverrides(): void {
		if (!overrides.data) return;
		setAudits(seedAudits(definitions, overrides.data.audits));
		setRulesText(JSON.stringify(overrides.data.rules, null, 2));
		setRulesError(null);
	}

	function discardAndChangeProject(): void {
		setProjectId(pendingProjectId ?? null);
		setPendingProjectId(undefined);
	}

	return (
		<div className={`space-y-4 ${commitBarClearanceClass}`}>
			<TabIntro
				description="Compare inherited audit policy with this project's explicit changes."
				title="Project audit policy"
			/>
			<FilterToolbar
				activeFilterCount={countActiveFilters(stateFilter !== 'all')}
				columns="@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_1fr]"
				filtered={visibleDefinitions.length}
				hasFilters={query.trim() !== '' || stateFilter !== 'all'}
				header={
					<CardHeader
						action={
							<div className="w-full sm:max-w-[18rem]">
								<FilterSelect
									className="max-sm:[&>label]:sr-only"
									label="Project"
									onChange={changeProject}
									options={[
										{ label: 'Select a project…', value: '' },
										...(manager.data?.projects ?? []).map((project) => ({
											label: project.name,
											value: project.id,
										})),
									]}
									value={projectId ?? ''}
								/>
							</div>
						}
						actionLayout="stacked"
						className="mb-0"
						status={
							selectedProjectName ? (
								<span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
									<span className="tabular-nums">
										{overriddenCount} overridden
									</span>
									{recordedUpdatedAt ? (
										<>
											Overrides updated{' '}
											<RelativeAge value={recordedUpdatedAt} />.
										</>
									) : (
										'No saved overrides yet.'
									)}
								</span>
							) : (
								<span className="text-xs text-muted-foreground">
									Choose a project to edit its effects and rules.
								</span>
							)
						}
					/>
				}
				mobileLayout="inline"
				noun="audits"
				onReset={resetFilters}
				primaryControlCount={1}
				total={definitions.length}>
				<FilterSearch onChange={setQuery} placeholder="Filter audits" value={query} />
				<FilterSelect
					label="State"
					onChange={(value) => setStateFilter(value as OverridesStateFilter)}
					options={[...overrideStateOptions]}
					value={stateFilter}
				/>
			</FilterToolbar>

			{projectId && (
				<div className="space-y-4">
					<OverridesList
						audits={audits}
						definitions={visibleDefinitions}
						dirty={dirty}
						filters={emptyFilters}
						inheritedEffects={inheritedEffects}
						onChange={(name, value) =>
							setAudits((current) => ({ ...current, [name]: value }))
						}
						persistedAudits={overrides.data?.audits ?? {}}
					/>

					<OverridesRulesCard
						error={rulesError}
						onChange={(value) => {
							setRulesError(null);
							setRulesText(value);
						}}
						value={rulesText}
					/>

					<CommitBar
						dirty={dirty}
						dirtyLabel={`${dirtyChangeCount} unsaved ${dirtyChangeCount === 1 ? 'change' : 'changes'}`}
						onDiscard={discardOverrides}
						onSave={applyOverrides}
						pending={update.isPending}
						saveLabel="Save Overrides"
					/>
				</div>
			)}

			<ConfirmDialog
				confirmLabel="Discard and switch"
				description={`Switching${pendingProjectName ? ` to ${pendingProjectName}` : ''} will discard ${dirtyChangeCount} unsaved ${dirtyChangeCount === 1 ? 'change' : 'changes'}.`}
				destructive
				onClose={() => setPendingProjectId(undefined)}
				onConfirm={discardAndChangeProject}
				open={pendingProjectId !== undefined}
				title="Discard unsaved overrides?"
			/>
		</div>
	);
}
