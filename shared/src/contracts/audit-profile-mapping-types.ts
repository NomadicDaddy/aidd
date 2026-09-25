import {
	type ProjectAssuranceBucket,
	type ProjectAuthMode,
	type ProjectCliBinary,
	type ProjectContainerImage,
	type ProjectCriticality,
	type ProjectDataSensitivity,
	type ProjectDeployment,
	type ProjectExternalIntegrations,
	type ProjectReleaseArtifacts,
	type ProjectTemplateOrigin,
} from './project-profile.ts';

export const auditEffectValues = ['default', 'disabled', 'required', 'excluded'] as const;
export const auditOverrideEffectValues = ['disabled', 'required', 'excluded'] as const;
export const auditApplicabilitySources = [
	'default',
	'global-rule',
	'override-rule',
	'override-explicit',
] as const;

export type AuditEffect = (typeof auditEffectValues)[number];
export type AuditOverrideEffect = (typeof auditOverrideEffectValues)[number];
export type AuditApplicabilitySource = (typeof auditApplicabilitySources)[number];

export const auditWildcard = '*';

/**
 * A rule matches a profile when every facet it names contains the profile's value; an unnamed facet
 * is unconstrained. The carriage facets are here for the same reason as the exposure ones — a gate
 * about container images or release archives is scoped by what the project produces, not by how
 * exposed it is, and before these existed such a gate could only be scoped by a list of repository
 * names.
 */
export interface AuditProfileMatch {
	authMode?: ProjectAuthMode[];
	bucket?: ProjectAssuranceBucket[];
	criticality?: ProjectCriticality[];
	dataSensitivity?: ProjectDataSensitivity[];
	deployment?: ProjectDeployment[];
	derivesFromTemplate?: ProjectTemplateOrigin[];
	externalIntegrations?: ProjectExternalIntegrations[];
	hasCliBinary?: ProjectCliBinary[];
	publishesReleaseArchives?: ProjectReleaseArtifacts[];
	shipsContainerImage?: ProjectContainerImage[];
}

export interface AuditProfileRule {
	audits: string[];
	description?: string;
	effect: AuditOverrideEffect;
	id: string;
	match: AuditProfileMatch;
}

export interface AuditProfileMapping {
	$schema?: string;
	/**
	 * Audits that only make sense for code built on a given package, keyed by audit name. Such an
	 * audit applies to a project only where one of its manifests depends on a listed package. The
	 * profile cannot express this: whether a project uses React says nothing about its exposure.
	 */
	requiresPackages?: Record<string, string[]>;
	rules: AuditProfileRule[];
	version: 1;
}

export interface AuditProfileOverrides {
	$schema?: string;
	audits: Record<string, AuditOverrideEffect>;
	rules: AuditProfileRule[];
	updatedAt: string;
	version: 1;
}

export interface AuditApplicabilityCell {
	applies: boolean;
	conditional?: boolean;
	effect: AuditEffect;
	ruleId?: string;
	source: AuditApplicabilitySource;
}

export interface AuditApplicabilityRow {
	auditName: string;
	byBucket: Record<ProjectAssuranceBucket, AuditApplicabilityCell>;
}
