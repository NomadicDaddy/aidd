/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import type {
	ProjectDetail,
	ProjectFeature,
	ProjectFeatureStatus,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';
import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';

import {
	useApproveProjectFeature,
	useDeleteProjectFeature,
	useUpdateProjectFeatureMilestone,
	useUpdateProjectFeatureStatus,
} from '../../../hooks/useProjects.ts';
import { useLaunchRun, useRuns } from '../../../hooks/useRuns.ts';
import {
	FEATURE_FILTER_PARAMS,
	featureDirectory,
	featureMatchesFilters,
	featureSourceLabel,
	isKnownStatusFilter,
	milestoneFilterOptions,
	sortedSourceOptions,
	sourceLabelCategory,
	withUnassignedMilestoneFilter,
} from './featuresUtils.ts';
import { clampPage } from './pagination-utils.ts';
import { FEATURES_PAGE_SIZE, stringValue } from './shared.ts';

const AUDIT_SOURCE_FILTER_PREFIX = 'Audit: ';

export function useFeaturesTab({
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
	const [page, setPage] = useState(0);
	const [decisions, setDecisions] = useState<Record<string, string>>({});
	const [selectedFeature, setSelectedFeature] = useState<null | ProjectFeature>(null);
	const [pendingDelete, setPendingDelete] = useState<null | ProjectFeature>(null);
	const [launchingFeature, setLaunchingFeature] = useState<null | string>(null);
	// Tab-level launch target: one chip in the toolbar applies to every feature run
	// launched from this tab (per-row chips would be noise × N rows).
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [searchParams, setSearchParams] = useSearchParams();
	const approveFeature = useApproveProjectFeature(projectId);
	const deleteFeature = useDeleteProjectFeature(projectId);
	const updateFeatureMilestone = useUpdateProjectFeatureMilestone(projectId);
	const updateFeatureStatus = useUpdateProjectFeatureStatus(projectId);
	const launchRun = useLaunchRun();
	const runs = useRuns(projectPath);
	// A run launched from a feature row gives only a transient toast; without an on-row signal the
	// Launch button re-enables the moment the toast fades, so it looks like you can launch the same
	// feature over and over. Mirror the page-level ActiveRunsBanner here: while any run for this
	// project is in progress, the row reflects it (button disabled + "Run active") so a launch is
	// clearly registered. Same `useRuns(projectPath)` source the banner uses (deduped by key).
	const hasActiveRun =
		runs.data?.pages.some((page) => page.runs.some((run) => run.status === 'running')) ?? false;
	const total = features.length;
	const milestoneOptions = roadmap?.milestoneOrder ?? Object.keys(roadmap?.milestones ?? {});
	const query = searchParams.get('featureQ') ?? '';
	const rawStatusFilter = searchParams.get('featureStatus') ?? 'all';
	const statusFilter = isKnownStatusFilter(rawStatusFilter) ? rawStatusFilter : 'all';
	const milestoneFilter = searchParams.get('featureMilestone') ?? 'all';
	const sourceFilter = searchParams.get('featureSource') ?? 'all';
	const sourceOptions = sortedSourceOptions(features);
	const filterMilestoneOptions = milestoneFilterOptions(features, roadmap);
	const filteredFeatures = features.filter((feature) =>
		featureMatchesFilters(feature, { milestoneFilter, query, sourceFilter, statusFilter }),
	);
	const filteredTotal = filteredFeatures.length;
	const hasFilters =
		query.trim().length > 0 ||
		statusFilter !== 'all' ||
		milestoneFilter !== 'all' ||
		sourceFilter !== 'all';
	useEffect(() => {
		setPage(0);
	}, [projectId]);
	useEffect(() => {
		setPage((current) => clampPage(current, filteredTotal, FEATURES_PAGE_SIZE));
	}, [filteredTotal]);
	const pageStart = page * FEATURES_PAGE_SIZE;
	const slice = filteredFeatures.slice(pageStart, pageStart + FEATURES_PAGE_SIZE);
	const isMutating =
		approveFeature.isPending ||
		deleteFeature.isPending ||
		updateFeatureMilestone.isPending ||
		updateFeatureStatus.isPending ||
		launchRun.isPending;

	function updateFilterParam(key: string, value: string): void {
		const next = new URLSearchParams(searchParams);
		if (value === '' || value === 'all') next.delete(key);
		else next.set(key, value);
		setPage(0);
		setSearchParams(next, { replace: true });
	}

	function showUnassigned(): void {
		setPage(0);
		setSearchParams(withUnassignedMilestoneFilter(searchParams), { replace: true });
	}

	function resetFilters(): void {
		const next = new URLSearchParams(searchParams);
		for (const key of FEATURE_FILTER_PARAMS) next.delete(key);
		setPage(0);
		setSearchParams(next, { replace: true });
	}

	function onApprove(feature: ProjectFeature, decisionRequired: boolean): void {
		const featureId = featureDirectory(feature);
		const decision = decisions[featureId]?.trim() ?? '';
		if (decisionRequired && decision.length === 0) {
			toast.error('Decision is required');
			return;
		}
		const variables: { decision?: string; decisionRequired: boolean; featureId: string } = {
			decisionRequired,
			featureId,
		};
		if (decision.length > 0) variables.decision = decision;
		approveFeature.mutate(variables, {
			onError: (error) =>
				toast.error(error instanceof Error ? error.message : 'Failed to approve feature'),
			onSuccess: () => {
				setDecisions((current) => ({ ...current, [featureId]: '' }));
				toast.success('Feature approved');
			},
		});
	}

	function onDelete(feature: ProjectFeature): void {
		setPendingDelete(feature);
	}

	function confirmDelete(): void {
		if (!pendingDelete) return;
		const featureId = featureDirectory(pendingDelete);
		deleteFeature.mutate(featureId, {
			onError: (error) =>
				toast.error(error instanceof Error ? error.message : 'Failed to delete feature'),
			onSettled: () => setPendingDelete(null),
			onSuccess: () => toast.success('Feature deleted'),
		});
	}

	function onStatusChange(feature: ProjectFeature, status: ProjectFeatureStatus): void {
		updateFeatureStatus.mutate(
			{ featureId: featureDirectory(feature), status },
			{
				onError: (error) =>
					toast.error(error instanceof Error ? error.message : 'Failed to update status'),
				onSuccess: () => toast.success('Feature status updated'),
			},
		);
	}

	// The audit-findings sweep is scoped by the active source filter: a specific "Audit: X"
	// filter narrows the sweep to that audit's findings; any broader filter sweeps all approved
	// findings. Eligible = an audit finding that is not passing and not waiting on approval.
	const auditFindingsSource = sourceFilter.startsWith(AUDIT_SOURCE_FILTER_PREFIX)
		? sourceFilter.slice(AUDIT_SOURCE_FILTER_PREFIX.length)
		: undefined;
	const eligibleAuditFindings = features.filter((feature) => {
		if (sourceLabelCategory(featureSourceLabel(feature)) !== 'audit') return false;
		if (feature.passes === true) return false;
		const status = stringValue(feature, 'status');
		if (status !== 'backlog' && status !== 'in_progress') return false;
		return auditFindingsSource
			? stringValue(feature, 'auditSource') === auditFindingsSource
			: true;
	});
	const auditFindingsCount = eligibleAuditFindings.length;

	function onWorkAuditFindings(): void {
		launchRun.mutate(
			{
				auditFindings: true,
				mode: 'coding',
				projectDir: projectPath,
				...(auditFindingsSource ? { auditFindingsSource } : {}),
				...(launchTarget.backend ? { backend: launchTarget.backend } : {}),
				...(launchTarget.model ? { model: launchTarget.model } : {}),
				...(launchTarget.reasoningEffort
					? { reasoningEffort: launchTarget.reasoningEffort }
					: {}),
			},
			{
				onError: (error) =>
					toast.error(
						error instanceof Error
							? error.message
							: 'Failed to launch audit-findings run',
					),
				onSuccess: () => toast.success('Audit-findings sweep launched'),
			},
		);
	}

	function onLaunchRun(feature: ProjectFeature): void {
		const featureId = featureDirectory(feature);
		setLaunchingFeature(featureId);
		launchRun.mutate(
			{
				feature: featureId,
				mode: 'coding',
				projectDir: projectPath,
				...(launchTarget.backend ? { backend: launchTarget.backend } : {}),
				...(launchTarget.model ? { model: launchTarget.model } : {}),
				...(launchTarget.reasoningEffort
					? { reasoningEffort: launchTarget.reasoningEffort }
					: {}),
			},
			{
				onError: (error) =>
					toast.error(
						error instanceof Error ? error.message : 'Failed to launch coding run',
					),
				onSettled: () => setLaunchingFeature(null),
				onSuccess: () => toast.success('Feature-specific coding run launched'),
			},
		);
	}

	function onMilestoneChange(feature: ProjectFeature, milestone: string): void {
		updateFeatureMilestone.mutate(
			{ featureId: featureDirectory(feature), milestone },
			{
				onError: (error) =>
					toast.error(
						error instanceof Error ? error.message : 'Failed to update milestone',
					),
				onSuccess: () => toast.success('Feature milestone updated'),
			},
		);
	}

	return {
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
	};
}
