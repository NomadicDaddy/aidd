export { isAuditOverrideEffect } from './audit-profile-mapping-facets.ts';
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
	resolveBucketAuditEffect,
} from './audit-profile-mapping-resolve.ts';

export {
	auditApplicabilitySources,
	auditEffectValues,
	auditOverrideEffectValues,
	auditWildcard,
} from './audit-profile-mapping-types.ts';

export type {
	AuditApplicabilityCell,
	AuditApplicabilityRow,
	AuditApplicabilitySource,
	AuditEffect,
	AuditOverrideEffect,
	AuditProfileMapping,
	AuditProfileMatch,
	AuditProfileOverrides,
	AuditProfileRule,
} from './audit-profile-mapping-types.ts';
