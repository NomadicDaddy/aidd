export type MaturityStageId =
	'audited' | 'engaged' | 'mapped' | 'planned' | 'shipped' | 'specified' | 'structured';

export type MaturityArtifactStatus = 'fail' | 'fresh' | 'missing' | 'skipped' | 'stale';

export type MaturityStageStatus = 'complete' | 'empty' | 'partial';

export type MaturityInvocationKind = 'audit' | 'feature' | 'manual' | 'profile' | 'skill';

export interface MaturityAuditEntryDto {
	ageDays: null | number;
	auditName: string;
	changes: {
		codeCommits: number;
		sourceFiles: number;
		sourceLines: number;
	} | null;
	freshness: 'fresh' | 'missing' | 'stale';
	lastReportAt: null | string;
	lastRunFinishedAt: null | string;
	lastRunId: null | string;
	lastRunStatus: 'failure' | 'success' | null;
	skipped: boolean;
	staleReasons: ('age' | 'code_commits' | 'source_files' | 'source_lines')[];
}

export interface MaturityArtifactDto {
	audit?: MaturityAuditEntryDto;
	kind:
		| 'audit-dynamic'
		| 'catalog'
		| 'fs-any'
		| 'fs-dir'
		| 'fs-file'
		| 'synthetic-changelog'
		| 'synthetic-feature'
		| 'synthetic-release';
	label: string;
	mtime: null | string;
	required: boolean;
	slug: string;
	status: MaturityArtifactStatus;
}

export interface MaturityStageDto {
	artifacts: MaturityArtifactDto[];
	complete: number;
	description: string;
	id: MaturityStageId;
	label: string;
	order: number;
	required: number;
	status: MaturityStageStatus;
}

export interface MaturityNextActionDto {
	args?: string;
	auditName?: string;
	command?: string;
	hint?: string;
	invocation: MaturityInvocationKind;
	postScript?: string;
	skillId?: string;
	slug: string;
	stageId: MaturityStageId;
	target?: string;
}

export interface MaturityBadgeDto {
	currentStageId: MaturityStageId | null;
	currentStageLabel: null | string;
	nextArtifactLabel: null | string;
	nextArtifactSlug: null | string;
	percent: number;
	stageStatuses: {
		id: MaturityStageId;
		label: string;
		status: MaturityStageStatus;
	}[];
}

export interface MaturityDto extends MaturityBadgeDto {
	auditProfileBucket: null | string;
	auditProfileLabel: null | string;
	nextAction: MaturityNextActionDto | null;
	skip: string[];
	stages: MaturityStageDto[];
}
