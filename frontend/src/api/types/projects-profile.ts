export interface ProjectInterviewProgress {
	answered: number;
	total: number;
}

export interface ProjectInterviewQuestion {
	id: string;
	priority: string;
	prompt: string;
	response?: string;
}

export type AnsweredInterviewQuestion = { response: string } & ProjectInterviewQuestion;

export interface ProjectInterviewDetail {
	answered: number;
	answeredQuestions: AnsweredInterviewQuestion[];
	hasQuestionsFile: boolean;
	total: number;
	unanswered: ProjectInterviewQuestion[];
}

export type ProjectReportKind = 'bug' | 'feature';

// Derived from the backing feature record by reportStatusFromFeature; there is no separate
// close action, so a resolved report is the terminal state and nothing ever produced 'closed'.
export type ProjectReportStatus = 'in_progress' | 'open' | 'resolved';

export interface ProjectReportMetadata {
	pathname?: string;
	url?: string;
	userAgent?: string;
	viewport?: {
		height: number;
		width: number;
	};
}

export interface ProjectReport {
	classificationReason?: string;
	createdAt: string;
	description: string;
	featureDirectory?: string;
	featureId?: string;
	id: string;
	kind: ProjectReportKind;
	metadata?: ProjectReportMetadata;
	reportedBy: {
		username: string;
	};
	status: ProjectReportStatus;
}

export interface ProjectReportInput {
	description: string;
	kind: ProjectReportKind;
	metadata?: ProjectReportMetadata;
}

export interface ProjectReportsResponse {
	bugs: ProjectReport[];
	lastUpdated: null | string;
}

export interface ProjectArtifactCheckCounts {
	fresh: number;
	missing: number;
	present: number;
	requiredMissing: number;
	stale: number;
	total: number;
}

export type ProjectArtifactSeverity = 'optional' | 'recommended' | 'required';

export type ProjectArtifactFreshness = 'fresh' | 'missing' | 'stale';

export interface ProjectArtifactRecord {
	ageDays: null | number;
	exists: boolean;
	freshness: ProjectArtifactFreshness;
	label: string;
	mtime: null | string;
	path: string;
	severity: ProjectArtifactSeverity;
	sizeBytes: number;
}

export interface ProjectArtifactCheckSummary {
	artifacts: ProjectArtifactRecord[];
	checkedAt: string;
	staleThresholdDays: number;
	summary: ProjectArtifactCheckCounts;
}

export type ProjectAssuranceBucket =
	| 'critical_regulated'
	| 'internet_single_org'
	| 'multi_user_local'
	| 'private_team'
	| 'prototype_archive'
	| 'public_multi_tenant'
	| 'single_user_local';

export type ProjectDataSensitivity = 'confidential' | 'low' | 'none' | 'personal' | 'regulated';

export type ProjectDeployment = 'cloud' | 'lan' | 'local' | 'private_server' | 'public_server';

export type ProjectAuthMode = 'local_owner' | 'login' | 'none' | 'rbac' | 'tenant_rbac';

export type ProjectCriticality = 'business_critical' | 'operational' | 'toy' | 'utility';

export type ProjectExternalIntegrations =
	'financial_or_security' | 'none' | 'read_only' | 'write_capable';

export type ProjectContainerImage = 'local_only' | 'none' | 'published';

export type ProjectCliBinary = 'none' | 'packaged_binary' | 'script_entry';

export type ProjectTemplateOrigin = 'none' | 'spernakit';

export type ProjectReleaseArtifacts = 'binary_archives' | 'none' | 'source_only';

export interface ProjectAssuranceProfile {
	authMode: ProjectAuthMode;
	bucket: ProjectAssuranceBucket;
	criticality: ProjectCriticality;
	dataSensitivity: ProjectDataSensitivity;
	deployment: ProjectDeployment;
	derivesFromTemplate: ProjectTemplateOrigin;
	externalIntegrations: ProjectExternalIntegrations;
	hasCliBinary: ProjectCliBinary;
	notes?: string;
	publishesReleaseArchives: ProjectReleaseArtifacts;
	shipsContainerImage: ProjectContainerImage;
	source: 'explicit' | 'inferred';
	updatedAt: string;
}

export interface ProjectAssuranceProfileInput {
	authMode: ProjectAuthMode;
	bucket: ProjectAssuranceBucket;
	criticality: ProjectCriticality;
	dataSensitivity: ProjectDataSensitivity;
	deployment: ProjectDeployment;
	derivesFromTemplate: ProjectTemplateOrigin;
	externalIntegrations: ProjectExternalIntegrations;
	hasCliBinary: ProjectCliBinary;
	notes?: string;
	publishesReleaseArchives: ProjectReleaseArtifacts;
	shipsContainerImage: ProjectContainerImage;
}
