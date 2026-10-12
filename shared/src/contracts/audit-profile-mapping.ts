export {
	normalizeAuditProfileMapping,
	normalizeAuditProfileOverrides,
} from './audit-profile-mapping-normalize.ts';

export {
	isAuditApplicableToProject,
	resolveProjectAuditEffect,
} from './audit-profile-mapping-project.ts';

export {
	buildApplicabilityMatrix,
	isAuditApplicableToProfile,
	isLowExposureLocalProfile,
	requiresFullHardening,
	resolveAuditEffect,
} from './audit-profile-mapping-resolve.ts';

export type {
	AuditApplicabilityRow,
	AuditProfileMapping,
	AuditProfileOverrides,
	AuditSurface,
	ProjectAuditEvidence,
} from './audit-profile-mapping-types.ts';
