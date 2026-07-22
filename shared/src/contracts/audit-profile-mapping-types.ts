import {
	type ProjectAssuranceBucket,
	type ProjectAuthMode,
	type ProjectCriticality,
	type ProjectDataSensitivity,
	type ProjectDeployment,
	type ProjectExternalIntegrations,
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

export interface AuditProfileMatch {
	authMode?: ProjectAuthMode[];
	bucket?: ProjectAssuranceBucket[];
	criticality?: ProjectCriticality[];
	dataSensitivity?: ProjectDataSensitivity[];
	deployment?: ProjectDeployment[];
	externalIntegrations?: ProjectExternalIntegrations[];
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
