import type {
	AuditApplicabilityCell,
	AuditProfileMapping,
	AuditProfileOverrides,
	AuditSurface,
	ProjectAuditEvidence,
} from './audit-profile-mapping-types.ts';
import type { ProjectAssuranceProfile } from './project-profile.ts';

import { resolveAuditEffect } from './audit-profile-mapping-resolve.ts';

const surfaceLabels: Record<AuditSurface, string> = {
	database: 'a database',
	'web-frontend': 'a web frontend',
};

/**
 * Applicability for one concrete project. Decided in this order, and the first step that settles
 * it is final:
 *
 * 1. An explicit per-project override (`overrides.audits[X]`): `required` applies, `disabled` and
 *    `excluded` do not.
 * 2. A rule in the project's overrides (`excluded` over `required` over `disabled`).
 * 3. A rule in the global mapping, ranked the same way.
 * 4. `requiresPackages`: an audit listed there does not apply unless a manifest declares one of
 *    its packages.
 * 5. `requiresSurface`: an audit listed there does not apply unless that surface was detected.
 * 6. Otherwise the audit applies.
 *
 * Steps 1 to 3 are `resolveAuditEffect`. Whatever effect they produce stands on its own, so the
 * project's own evidence is consulted only for an audit nothing has ruled on. That gives both
 * escape hatches: a project the detector reads as lacking a surface marks the audit `required`,
 * and a project it reads as having one marks the audit `excluded` or `disabled`.
 */
export function resolveProjectAuditEffect(
	profile: ProjectAssuranceProfile,
	evidence: ProjectAuditEvidence,
	auditName: string,
	mapping: AuditProfileMapping,
	overrides?: AuditProfileOverrides | null,
): AuditApplicabilityCell {
	const cell = resolveAuditEffect(profile, auditName, mapping, overrides);
	if (cell.effect !== 'default') return cell;
	const normalized = auditName.toUpperCase();
	const packages = mapping.requiresPackages?.[normalized];
	if (packages !== undefined && !packages.some((name) => evidence.packages.has(name))) {
		return {
			applies: false,
			effect: 'disabled',
			reason: `requires one of: ${packages.join(', ')}; none declared`,
			source: 'missing-package',
		};
	}
	const surface = mapping.requiresSurface?.[normalized];
	if (surface !== undefined && !evidence.surfaces.has(surface)) {
		return {
			applies: false,
			effect: 'disabled',
			reason: `requires ${surfaceLabels[surface]}; none detected`,
			source: 'missing-surface',
		};
	}
	return cell;
}

export function isAuditApplicableToProject(
	profile: ProjectAssuranceProfile,
	evidence: ProjectAuditEvidence,
	auditName: string,
	mapping: AuditProfileMapping,
	overrides?: AuditProfileOverrides | null,
): boolean {
	return resolveProjectAuditEffect(profile, evidence, auditName, mapping, overrides).applies;
}
