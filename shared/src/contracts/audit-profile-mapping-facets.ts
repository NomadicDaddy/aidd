import {
	type AuditOverrideEffect,
	auditOverrideEffectValues,
	type AuditProfileMatch,
} from './audit-profile-mapping-types.ts';
import {
	projectAssuranceBuckets,
	projectAuthModeValues,
	projectCliBinaryValues,
	projectContainerImageValues,
	projectCriticalityValues,
	projectDataSensitivityValues,
	projectDeploymentValues,
	projectExternalIntegrationValues,
	projectReleaseArtifactValues,
	projectTemplateOriginValues,
} from './project-profile.ts';

const bucketSet = new Set<string>(projectAssuranceBuckets);
const authModeSet = new Set<string>(projectAuthModeValues);
const cliBinarySet = new Set<string>(projectCliBinaryValues);
const containerImageSet = new Set<string>(projectContainerImageValues);
const criticalitySet = new Set<string>(projectCriticalityValues);
const dataSensitivitySet = new Set<string>(projectDataSensitivityValues);
const deploymentSet = new Set<string>(projectDeploymentValues);
const externalIntegrationSet = new Set<string>(projectExternalIntegrationValues);
const releaseArtifactSet = new Set<string>(projectReleaseArtifactValues);
const templateOriginSet = new Set<string>(projectTemplateOriginValues);
const auditOverrideEffectSet = new Set<string>(auditOverrideEffectValues);

export const matchFacetSets: Record<keyof AuditProfileMatch, ReadonlySet<string>> = {
	authMode: authModeSet,
	bucket: bucketSet,
	criticality: criticalitySet,
	dataSensitivity: dataSensitivitySet,
	deployment: deploymentSet,
	derivesFromTemplate: templateOriginSet,
	externalIntegrations: externalIntegrationSet,
	hasCliBinary: cliBinarySet,
	publishesReleaseArchives: releaseArtifactSet,
	shipsContainerImage: containerImageSet,
};

export const matchFacetKeys = Object.keys(matchFacetSets) as (keyof AuditProfileMatch)[];

export function isAuditOverrideEffect(value: unknown): value is AuditOverrideEffect {
	return typeof value === 'string' && auditOverrideEffectSet.has(value);
}
