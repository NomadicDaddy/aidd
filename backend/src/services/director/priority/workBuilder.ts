import type { DirectorRiskLevel } from 'aidd-shared';

import type { ProjectArtifactCheckSummary, ProjectSummaryDto } from '../../../types.ts';
import type {
	DirectorAuditHealth,
	DirectorBacklogBreakdown,
	DirectorPrioritizedWork,
} from './types.ts';

import {
	auditBacklogPolicy,
	auditMaintenancePolicyForProfile,
	maturityDefersAudits,
} from './auditPolicy.ts';
import { topPriority } from './helpers.ts';
import { sortPrioritizedWork } from './priorityHealth.ts';

export { expandTargetedWork } from './targetedWork.ts';

export function buildProjectWork(
	project: ProjectSummaryDto,
	backlog: DirectorBacklogBreakdown,
	auditHealth: DirectorAuditHealth,
	auditsEnabled: boolean,
): DirectorPrioritizedWork[] {
	const work: DirectorPrioritizedWork[] = [];
	// An onboarding-phase project with no features yet has code but has not been analyzed:
	// add an intake nudge. It is additive (does not preempt established maintenance/backlog
	// work) and gated on featureStats.total so projects merely missing one contract file
	// keep their normal suggestions. Gate on total === 0 so it disappears once intake runs.
	if (project.phase === 'onboarding' && project.featureStats.total === 0) {
		work.push({
			evidence: { phase: project.phase, profile: profileEvidence(project) },
			projectId: project.name,
			rank: 0,
			reason: `${project.name} is in onboarding with no feature coverage yet. Run project intake to analyze, profile, and generate its feature backlog.`,
			riskLevel: 'MEDIUM',
			suggestedArgs: null,
			suggestedRecipe: 'project-intake',
			taskType: 'project_intake',
			title: `${project.name}: run project intake`,
		});
	}
	const artifact = project.metadata.artifactCheck;
	const artifactIssue = artifactIssueSummary(project.artifactHealth, artifact);
	if (artifactIssue !== null) {
		work.push({
			evidence: {
				artifactHealth: project.artifactHealth,
				artifactSummary: artifact?.summary ?? null,
				checkedAt: artifact?.checkedAt ?? null,
				count: artifactIssue.count,
				profile: profileEvidence(project),
				staleThresholdDays: artifact?.staleThresholdDays ?? 30,
			},
			projectId: project.name,
			rank: 0,
			reason: artifactIssue.reason,
			riskLevel: artifactIssue.riskLevel,
			suggestedArgs: null,
			suggestedRecipe: 'reconcile-project-artifacts',
			taskType: 'artifact_maintenance',
			title: `${project.name}: reconcile aidd artifacts`,
		});
	}
	const suppressBacklog = profileSuppressesBacklog(project);
	const auditPolicy = auditBacklogPolicy(project, backlog.audit.bySeverity);
	if (auditsEnabled && !suppressBacklog && backlog.audit.count > 0 && auditPolicy.include) {
		work.push({
			evidence: {
				auditBacklogCount: backlog.audit.count,
				bySeverity: backlog.audit.bySeverity,
				count: backlog.audit.count,
				maturityDeferred: maturityDefersAudits(project),
				maturityStage: project.metadata.maturity.currentStageId,
				profile: profileEvidence(project),
				profileAdjustment: auditPolicy.adjustment,
				sourcePriority: topPriority(backlog.audit.top),
				top: backlog.audit.top,
			},
			projectId: project.name,
			rank: 0,
			reason: `${project.name} has ${backlog.audit.count} audit backlog item(s). ${auditPolicy.reason}`,
			riskLevel: auditPolicy.riskLevel,
			suggestedArgs: { filterBy: 'id', filterValue: 'audit-*' },
			suggestedRecipe: 'remediate-audit-findings',
			taskType: 'audit_backlog',
			title: `${project.name}: resolve audit backlog`,
		});
	}
	if (!suppressBacklog && backlog.remediation.count > 0) {
		work.push({
			evidence: {
				count: backlog.remediation.count,
				profile: profileEvidence(project),
				remediationBacklogCount: backlog.remediation.count,
				sourcePriority: topPriority(backlog.remediation.top),
				top: backlog.remediation.top,
			},
			projectId: project.name,
			rank: 0,
			reason: `${project.name} has ${backlog.remediation.count} remediation backlog item(s).`,
			riskLevel: backlog.remediation.count > 2 ? 'HIGH' : 'MEDIUM',
			suggestedArgs: { filterBy: 'id', filterValue: 'remediation-*' },
			suggestedRecipe: 'remediate-bugs',
			taskType: 'remediation_backlog',
			title: `${project.name}: resolve remediation backlog`,
		});
	}
	const auditIssueCount = auditHealth.missing.length + auditHealth.stale.length;
	if (auditsEnabled && !suppressBacklog && auditIssueCount > 0) {
		const auditMaintenancePolicy = auditMaintenancePolicyForProfile(project, auditIssueCount);
		work.push({
			evidence: {
				auditHealth,
				count: auditIssueCount,
				maturityDeferred: maturityDefersAudits(project),
				maturityStage: project.metadata.maturity.currentStageId,
				missing: auditHealth.missing,
				profile: profileEvidence(project),
				profileAdjustment: auditMaintenancePolicy.adjustment,
				stale: auditHealth.stale,
			},
			projectId: project.name,
			rank: 0,
			reason: `${project.name} has ${auditIssueCount} missing or stale applicable audit report(s). ${auditMaintenancePolicy.reason}`,
			riskLevel: auditMaintenancePolicy.riskLevel,
			suggestedArgs: null,
			suggestedRecipe: 'audit-all',
			taskType: 'audit_maintenance',
			title: `${project.name}: refresh audit reports`,
		});
	}
	const readyFeatureCount = backlog.feature.readyCount;
	if (!suppressBacklog && readyFeatureCount > 0) {
		work.push({
			evidence: {
				blockedCount: backlog.feature.blockedCount,
				count: readyFeatureCount,
				featureBacklogCount: backlog.feature.count,
				profile: profileEvidence(project),
				readyCount: readyFeatureCount,
				sourcePriority: topPriority(backlog.feature.top),
				top: backlog.feature.top,
			},
			projectId: project.name,
			rank: 0,
			reason: `${project.name} has ${backlog.feature.count} regular backlog feature(s), with ${readyFeatureCount} dependency-ready.`,
			riskLevel:
				readyFeatureCount > 5 || topPriority(backlog.feature.top) <= 2 ? 'MEDIUM' : 'LOW',
			suggestedArgs: null,
			suggestedRecipe: 'coding',
			taskType: 'feature_completion',
			title: `${project.name}: continue feature backlog`,
		});
	}
	return sortPrioritizedWork(work);
}

function artifactIssueSummary(
	artifactHealth: ProjectSummaryDto['artifactHealth'],
	artifactCheck: null | ProjectArtifactCheckSummary,
): { count: number; reason: string; riskLevel: DirectorRiskLevel } | null {
	if (artifactHealth === 'unknown' || artifactCheck === null) {
		return {
			count: 1,
			reason: 'Artifact health is unknown because no artifact check summary is available.',
			riskLevel: 'HIGH',
		};
	}
	const summary = artifactCheck.summary;
	const actionableMissing = summary.requiredMissing;
	const actionableStale = summary.stale;
	if (actionableMissing === 0 && actionableStale === 0) return null;
	return {
		count: actionableMissing + actionableStale,
		reason: `Artifact check reports ${actionableMissing} required missing and ${actionableStale} stale artifact(s).`,
		riskLevel: actionableMissing > 0 ? 'HIGH' : 'MEDIUM',
	};
}

function profileSuppressesBacklog(project: ProjectSummaryDto): boolean {
	return project.metadata.profile.bucket === 'prototype_archive';
}

function profileEvidence(project: ProjectSummaryDto): Record<string, unknown> {
	const profile = project.metadata.profile;
	return {
		authMode: profile.authMode,
		bucket: profile.bucket,
		criticality: profile.criticality,
		dataSensitivity: profile.dataSensitivity,
		deployment: profile.deployment,
		externalIntegrations: profile.externalIntegrations,
		source: profile.source,
	};
}
