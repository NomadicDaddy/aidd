import {
	auditOverrideEffectValues,
	type AuditOverrideEffect,
	type AuditProfileMatch,
} from './audit-profile-mapping-types.ts';
import {
	projectAssuranceBuckets,
	projectAuthModeValues,
	projectCriticalityValues,
	projectDataSensitivityValues,
	projectDeploymentValues,
	projectExternalIntegrationValues,
} from './project-profile.ts';

const bucketSet = new Set<string>(projectAssuranceBuckets);
const authModeSet = new Set<string>(projectAuthModeValues);
const criticalitySet = new Set<string>(projectCriticalityValues);
const dataSensitivitySet = new Set<string>(projectDataSensitivityValues);
const deploymentSet = new Set<string>(projectDeploymentValues);
const externalIntegrationSet = new Set<string>(projectExternalIntegrationValues);
const auditOverrideEffectSet = new Set<string>(auditOverrideEffectValues);

export const matchFacetSets: Record<keyof AuditProfileMatch, ReadonlySet<string>> = {
	authMode: authModeSet,
	bucket: bucketSet,
	criticality: criticalitySet,
	dataSensitivity: dataSensitivitySet,
	deployment: deploymentSet,
	externalIntegrations: externalIntegrationSet,
};

export const matchFacetKeys = Object.keys(matchFacetSets) as (keyof AuditProfileMatch)[];

export function isAuditOverrideEffect(value: unknown): value is AuditOverrideEffect {
	return typeof value === 'string' && auditOverrideEffectSet.has(value);
}
