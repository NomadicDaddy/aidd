import type { ProjectAssuranceBucket } from './projects-profile.ts';

export type AuditAssuranceBucket =
	| 'critical_regulated'
	| 'internet_single_org'
	| 'multi_user_local'
	| 'private_team'
	| 'prototype_archive'
	| 'public_multi_tenant'
	| 'single_user_local';

export type AuditEffect = 'default' | 'disabled' | 'excluded' | 'required';
export type AuditOverrideEffect = 'disabled' | 'excluded' | 'required';
export type AuditApplicabilitySource =
	'default' | 'global-rule' | 'override-explicit' | 'override-rule';

export interface AuditProfileMatch {
	authMode?: string[];
	bucket?: AuditAssuranceBucket[];
	criticality?: string[];
	dataSensitivity?: string[];
	deployment?: string[];
	externalIntegrations?: string[];
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
	byBucket: Record<AuditAssuranceBucket, AuditApplicabilityCell>;
}

export interface AuditProfileMappingResponse {
	auditNames: string[];
	mapping: AuditProfileMapping;
	matrix: AuditApplicabilityRow[];
}

export type AuditChangePotentialBand = 'High' | 'Low' | 'Medium';
export type AuditChangePotentialConfidence = 'High' | 'Low' | 'Medium';

export interface AuditChangePotentialEvidence {
	actionable: boolean;
	activeAuditFeatures: number;
	appsWithAuditReports: number;
	appsWithCompletedFeatureEvidence: number;
	completedRunsWithFindings: number;
	incompleteAuditRuns: number;
	priority: 'Critical' | 'High' | 'Medium' | null;
}

export interface AuditChangePotential {
	band: AuditChangePotentialBand;
	confidence: AuditChangePotentialConfidence;
	evidence: AuditChangePotentialEvidence;
	score: number;
}

export interface AuditDefinition {
	applicableBucketCount: number;
	applicableProjectCount: number;
	appliesToBucket: Record<AuditAssuranceBucket, boolean>;
	changePotential?: AuditChangePotential;
	content?: string;
	enabled: boolean;
	excludedProjectCount: number;
	freshReportCount: number;
	missingReportCount: number;
	name: string;
	path: string;
	staleReportCount: number;
	updatedAt: null | string;
}

export interface AuditManager {
	auditsEnabled: boolean;
	definitions: AuditDefinition[];
	projects: { id: string; name: string; path: string }[];
}

export interface ProjectAuditEntry {
	appliesToBucket: boolean;
	changePotential?: AuditChangePotential;
	enabled: boolean;
	freshReport: boolean;
	missingReport: boolean;
	name: string;
	overrideEffect: AuditOverrideEffect | null;
	path: string;
	reportFreshness?: AuditReportFreshness;
	staleReport: boolean;
	updatedAt: null | string;
}

export interface AuditReportCodeChanges {
	codeCommits: number;
	sourceFiles: number;
	sourceLines: number;
}

export interface AuditReportFreshness {
	ageDays: null | number;
	changes: AuditReportCodeChanges | null;
	reasons: AuditReportStaleReason[];
	report: null | string;
}

export type AuditReportStaleReason = 'age' | 'code_commits' | 'source_files' | 'source_lines';

export interface ProjectAuditsResponse {
	auditsEnabled: boolean;
	bucket: ProjectAssuranceBucket;
	entries: ProjectAuditEntry[];
	projectId: string;
	projectName: string;
	projectPath: string;
}

export interface AuditLaunchRequest {
	auditAll?: boolean;
	auditNames?: string[];
	projectIds: string[];
	review?: boolean;
}

export interface AuditLaunchResult {
	failures: string[];
	runIds: string[];
}
