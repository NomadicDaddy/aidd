/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { AuditOverrideEffect } from '../../../api/types.ts';
import type { EnabledFilter, OverrideValue } from './auditsTabUtils.tsx';

import {
	useLaunchAudits,
	useProjectAudits,
	useProjectAuditOverrides,
	useUpdateProjectAuditOverrides,
} from '../../../hooks/useAudits.ts';

export function useProjectAuditsTab(projectId: string, projectName: string) {
	const audits = useProjectAudits(projectId);
	const overrides = useProjectAuditOverrides(projectId);
	const launch = useLaunchAudits();
	const updateOverrides = useUpdateProjectAuditOverrides();
	const [query, setQuery] = useState('');
	const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>('all');
	const [selected, setSelected] = useState<string[]>([]);

	const auditsEnabled = audits.data?.auditsEnabled ?? true;

	const lower = query.trim().toLowerCase();
	const matchingEntries = (audits.data?.entries ?? []).filter((entry) => {
		if (lower && !`${entry.name} ${entry.path}`.toLowerCase().includes(lower)) return false;
		if (enabledFilter === 'enabled' && !entry.enabled) return false;
		if (enabledFilter === 'disabled' && entry.enabled) return false;
		return true;
	});
	const filtered = matchingEntries.slice().sort((left, right) => {
		const leftScore = left.changePotential?.score ?? -1;
		const rightScore = right.changePotential?.score ?? -1;
		if (leftScore !== rightScore) return rightScore - leftScore;
		return left.name.localeCompare(right.name);
	});

	useEffect(() => {
		const valid = new Set(filtered.map((entry) => entry.name));
		setSelected((current) => current.filter((name) => valid.has(name)));
	}, [filtered]);

	const selectedRunnable = selected.filter((name) =>
		(audits.data?.entries ?? []).find((entry) => entry.name === name && entry.enabled)
	);
	const runDisabledReason = !auditsEnabled
		? 'Audits are globally disabled. Re-enable from the Audits page.'
		: selectedRunnable.length === 0
			? 'Select one or more enabled audits to run.'
			: launch.isPending
				? 'A launch is already in progress…'
				: undefined;

	function toggleSelected(name: string) {
		setSelected((current) =>
			current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]
		);
	}

	const selectableNames = filtered
		.filter((entry) => entry.enabled && auditsEnabled)
		.map((entry) => entry.name);

	function selectAll() {
		setSelected(selectableNames);
	}

	function clearAll() {
		setSelected([]);
	}

	function runSelected(review: boolean) {
		if (selectedRunnable.length === 0) return;
		launch.mutate(
			{ auditNames: selectedRunnable, projectIds: [projectId], review },
			{
				onError: (error) =>
					toast.error(error instanceof Error ? error.message : 'Could not launch audits'),
				onSuccess: (result) => {
					if (result.runIds.length > 0) {
						toast.success(
							`Launched ${result.runIds.length} run${result.runIds.length === 1 ? '' : 's'} on ${projectName}`
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

	function runSingle(name: string, review: boolean) {
		launch.mutate(
			{ auditNames: [name], projectIds: [projectId], review },
			{
				onError: (error) =>
					toast.error(error instanceof Error ? error.message : 'Could not launch audit'),
				onSuccess: (result) => {
					if (result.runIds.length > 0) {
						toast.success(`Launched ${review ? 'review' : 'run'} for ${name}`);
					}
					if (result.failures.length > 0) {
						toast.error('Audit launch failed', {
							description: result.failures.slice(0, 2).join(' | '),
						});
					}
				},
			}
		);
	}

	function changeOverride(name: string, value: OverrideValue) {
		if (!overrides.data) return;
		const nextAudits: Record<string, AuditOverrideEffect> = { ...overrides.data.audits };
		if (value === 'default') delete nextAudits[name];
		else nextAudits[name] = value;
		updateOverrides.mutate(
			{
				overrides: {
					audits: nextAudits,
					rules: overrides.data.rules,
					updatedAt: new Date().toISOString(),
					version: 1,
				},
				projectId,
			},
			{
				onError: (error) =>
					toast.error(error instanceof Error ? error.message : 'Could not save override'),
				onSuccess: () => toast.success(`Override for ${name} saved`),
			}
		);
	}

	return {
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
	};
}
