export {
	normalizeAuditProfileMapping,
	normalizeAuditProfileOverrides,
} from './audit-profile-mapping-normalize.ts';

export {
	buildApplicabilityMatrix,
	isAuditApplicableToProfile,
	requiresFullHardening,
	isLowExposureLocalProfile,
	resolveAuditEffect,
} from './audit-profile-mapping-resolve.ts';

export type {
	AuditApplicabilityRow,
	AuditProfileMapping,
	AuditProfileOverrides,
} from './audit-profile-mapping-types.ts';
