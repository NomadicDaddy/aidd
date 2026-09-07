import type { DirectorRiskLevel } from 'aidd-shared';

import { MATURITY_STAGE_ORDER } from 'aidd-shared/metadata/maturity';
import {
	isLowExposureLocalProfile,
	requiresFullHardening,
} from 'aidd-shared/metadata/project-profile';

import type { ProjectSummaryDto } from '../../../types.ts';

function auditBacklogRisk(bySeverity: Record<string, number>): DirectorRiskLevel {
	if ((bySeverity.critical ?? 0) > 0 || (bySeverity.high ?? 0) > 0) return 'HIGH';
	return 'MEDIUM';
}

// Audit work is deferred (not suppressed) while a project is still building out from
// template. This is a *completeness* gate, orthogonal to the profile's *exposure* axis: a
// LIGHTHOUSE audit still applies to a fresh multi-user-local app, but the director should
// not rank it HIGH before the app reaches the 'engaged' maturity stage.
const AUDIT_MATURITY_GATE_STAGE = 'engaged';

export function maturityDefersAudits(project: ProjectSummaryDto): boolean {
	const stage = project.metadata.maturity.currentStageId;
	// A null/unknown stage is the most immature state — treat it as rank 0.
	const rank = stage ? MATURITY_STAGE_ORDER.indexOf(stage) : 0;
	const gate = MATURITY_STAGE_ORDER.indexOf(AUDIT_MATURITY_GATE_STAGE);
	return rank < gate;
}

// Cap, never silence: HIGH downgrades to MEDIUM; MEDIUM/LOW are left as-is so deferred audit
// work stays visible but never sits top-of-queue while the scaffold is incomplete.
function capAtMedium(risk: DirectorRiskLevel): DirectorRiskLevel {
	return risk === 'HIGH' ? 'MEDIUM' : risk;
}

function applyMaturityDeferral<
	T extends { adjustment: string; reason: string; riskLevel: DirectorRiskLevel },
>(project: ProjectSummaryDto, base: T): T {
	if (!maturityDefersAudits(project)) return base;
	return {
		...base,
		adjustment: `${base.adjustment}+deferred_premature_maturity`,
		reason: `${base.reason} Capped while project is below the '${AUDIT_MATURITY_GATE_STAGE}' maturity stage.`,
		riskLevel: capAtMedium(base.riskLevel),
	};
}

export function auditBacklogPolicy(
	project: ProjectSummaryDto,
	bySeverity: Record<string, number>,
): {
	adjustment: string;
	include: boolean;
	reason: string;
	riskLevel: DirectorRiskLevel;
} {
	const profile = project.metadata.profile;
	const base = ((): {
		adjustment: string;
		include: boolean;
		reason: string;
		riskLevel: DirectorRiskLevel;
	} => {
		if (requiresFullHardening(profile)) {
			return {
				adjustment: 'escalated_full_hardening',
				include: true,
				reason: `The ${profile.bucket} profile keeps audit hardening fully applicable.`,
				riskLevel: 'HIGH',
			};
		}
		if (!isLowExposureLocalProfile(profile)) {
			return {
				adjustment: 'none',
				include: true,
				reason: `The ${profile.bucket} profile leaves audit backlog priority unchanged.`,
				riskLevel: auditBacklogRisk(bySeverity),
			};
		}
		if ((bySeverity.critical ?? 0) > 0) {
			return {
				adjustment: 'local_critical_retained',
				include: true,
				reason: 'The single-user local profile keeps critical findings visible even with local-only exposure.',
				riskLevel: 'HIGH',
			};
		}
		if ((bySeverity.high ?? 0) > 0) {
			return {
				adjustment: 'local_high_downgraded',
				include: true,
				reason: 'The single-user local profile downgrades non-critical audit hardening because deployment and data exposure are low.',
				riskLevel: 'MEDIUM',
			};
		}
		if ((bySeverity.medium ?? 0) > 0) {
			return {
				adjustment: 'local_medium_downgraded',
				include: true,
				reason: 'The single-user local profile keeps medium audit findings advisory and low risk.',
				riskLevel: 'LOW',
			};
		}
		return {
			adjustment: 'local_low_suppressed',
			include: false,
			reason: 'The single-user local profile suppresses low-only audit backlog suggestions.',
			riskLevel: 'LOW',
		};
	})();
	// Deferral only applies to work that would otherwise be surfaced.
	return base.include ? applyMaturityDeferral(project, base) : base;
}

export function auditMaintenancePolicyForProfile(
	project: ProjectSummaryDto,
	auditIssueCount: number,
): { adjustment: string; reason: string; riskLevel: DirectorRiskLevel } {
	const profile = project.metadata.profile;
	const base = ((): { adjustment: string; reason: string; riskLevel: DirectorRiskLevel } => {
		if (requiresFullHardening(profile)) {
			return {
				adjustment: 'escalated_full_hardening',
				reason: `The ${profile.bucket} profile requires fresh audit coverage.`,
				riskLevel: auditIssueCount > 1 ? 'MEDIUM' : 'LOW',
			};
		}
		if (isLowExposureLocalProfile(profile)) {
			return {
				adjustment: 'local_applicable_only',
				reason: 'The single-user local profile limits audit maintenance to applicable local checks.',
				riskLevel: 'LOW',
			};
		}
		return {
			adjustment: 'none',
			reason: `The ${profile.bucket} profile leaves audit maintenance priority unchanged.`,
			riskLevel: auditIssueCount > 2 ? 'MEDIUM' : 'LOW',
		};
	})();
	return applyMaturityDeferral(project, base);
}
