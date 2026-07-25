import type {
	MaturityStageId,
	ProjectAssuranceBucket,
	ProjectAuthMode,
	ProjectCriticality,
	ProjectDataSensitivity,
	ProjectDeployment,
	ProjectExternalIntegrations,
	ProjectMetadata,
	ProjectPhase,
	ProjectSummary,
	ProjectSyncState,
	ProjectUsageTotals,
} from '../../api/types.ts';

import { formatCompactNumber } from '../../lib/formatters.ts';

export type ArtifactHealth = ProjectSummary['artifactHealth'];
export type BadgeTone = 'amber' | 'emerald' | 'neutral' | 'red' | 'teal';

export const SYNC_STATES: ReadonlySet<ProjectSyncState> = new Set([
	'error',
	'idle',
	'syncing',
	'unknown',
]);
export const PHASES: ReadonlySet<ProjectPhase> = new Set(['coding', 'initializer', 'onboarding']);

export type MaturityFilter = 'all' | 'complete' | 'incomplete' | MaturityStageId;

export const MATURITY_FILTERS: ReadonlySet<MaturityFilter> = new Set([
	'all',
	'incomplete',
	'complete',
	'specified',
	'structured',
	'mapped',
	'planned',
	'engaged',
	'audited',
	'shipped',
]);

export const maturityFilterLabels: Record<MaturityFilter, string> = {
	all: 'All maturity',
	audited: 'In audited',
	complete: '100% complete',
	engaged: 'In engaged',
	incomplete: 'Under 100%',
	mapped: 'In mapped',
	planned: 'In planned',
	shipped: 'In shipped',
	specified: 'In specified',
	structured: 'In structured',
};

export const bucketLabels: Record<ProjectAssuranceBucket, string> = {
	critical_regulated: 'Critical',
	internet_single_org: 'Internet org',
	multi_user_local: 'Multi-user local',
	private_team: 'Private team',
	prototype_archive: 'Archive',
	public_multi_tenant: 'Multi-tenant',
	single_user_local: 'Single-user local',
};

export const dataSensitivityLabels: Record<ProjectDataSensitivity, string> = {
	confidential: 'Confidential',
	low: 'Low',
	none: 'None',
	personal: 'Personal',
	regulated: 'Regulated',
};

export const deploymentLabels: Record<ProjectDeployment, string> = {
	cloud: 'Cloud',
	lan: 'LAN',
	local: 'Local',
	private_server: 'Private server',
	public_server: 'Public server',
};

export const authModeLabels: Record<ProjectAuthMode, string> = {
	local_owner: 'Local owner',
	login: 'Login',
	none: 'None',
	rbac: 'RBAC',
	tenant_rbac: 'Tenant RBAC',
};

export const criticalityLabels: Record<ProjectCriticality, string> = {
	business_critical: 'Business critical',
	operational: 'Operational',
	toy: 'Toy',
	utility: 'Utility',
};

export const externalIntegrationLabels: Record<ProjectExternalIntegrations, string> = {
	financial_or_security: 'Financial/security',
	none: 'None',
	read_only: 'Read-only',
	write_capable: 'Write-capable',
};

export const bucketOptions: ProjectAssuranceBucket[] = [
	'prototype_archive',
	'single_user_local',
	'multi_user_local',
	'private_team',
	'internet_single_org',
	'public_multi_tenant',
	'critical_regulated',
];
export const dataSensitivityOptions: ProjectDataSensitivity[] = [
	'none',
	'low',
	'personal',
	'confidential',
	'regulated',
];
export const deploymentOptions: ProjectDeployment[] = [
	'local',
	'lan',
	'private_server',
	'public_server',
	'cloud',
];
export const authModeOptions: ProjectAuthMode[] = [
	'none',
	'local_owner',
	'login',
	'rbac',
	'tenant_rbac',
];
export const criticalityOptions: ProjectCriticality[] = [
	'toy',
	'utility',
	'operational',
	'business_critical',
];
export const externalIntegrationOptions: ProjectExternalIntegrations[] = [
	'none',
	'read_only',
	'write_capable',
	'financial_or_security',
];

export const artifactTone: Record<ArtifactHealth, BadgeTone> = {
	fresh: 'emerald',
	missing: 'red',
	stale: 'amber',
	unknown: 'neutral',
};

export function profileBucketTone(bucket: ProjectAssuranceBucket): BadgeTone {
	if (bucket === 'critical_regulated' || bucket === 'public_multi_tenant') return 'red';
	if (bucket === 'internet_single_org') return 'amber';
	if (bucket === 'prototype_archive') return 'neutral';
	if (bucket === 'single_user_local') return 'emerald';
	return 'teal';
}

export function syncTone(state: ProjectSyncState): BadgeTone {
	if (state === 'error') return 'red';
	if (state === 'syncing') return 'teal';
	if (state === 'idle') return 'emerald';
	return 'neutral';
}

export function formatAppVersion(appVersion: ProjectMetadata['appVersion']): string {
	return appVersion ? `v${appVersion}` : 'Not declared';
}

export function formatTemplateVersion({
	stack,
	templateVersion,
}: Pick<ProjectMetadata, 'stack' | 'templateVersion'>): string {
	if (templateVersion) return `spk ${templateVersion}`;
	if (stack.family === 'spernakit') return 'Template version not declared';
	return 'Not template-based';
}

const reportedCostFormatter = new Intl.NumberFormat(undefined, {
	currency: 'USD',
	currencyDisplay: 'narrowSymbol',
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: 'currency',
});

type ReportedCostTotals = Pick<ProjectUsageTotals, 'reportedCostUsd' | 'runsWithReportedCost'>;

export function formatReportedCost(totals: ReportedCostTotals): string {
	return totals.runsWithReportedCost > 0
		? reportedCostFormatter.format(totals.reportedCostUsd)
		: 'Unknown';
}

export function formatProjectTokenCount(totals: Pick<ProjectUsageTotals, 'totalTokens'>): string {
	return `${formatCompactNumber(totals.totalTokens)} tokens`;
}

export function formatProjectListReportedCost(totals: ReportedCostTotals): string {
	return totals.runsWithReportedCost > 0 ? formatReportedCost(totals) : '—';
}
