import type { AuditReportCodeChanges, AuditReportStaleReason } from './audits.ts';

export type MaturityStageId =
	'audited' | 'engaged' | 'mapped' | 'planned' | 'shipped' | 'specified' | 'structured';

export type MaturityArtifactStatus = 'fail' | 'fresh' | 'missing' | 'skipped' | 'stale';

export type MaturityStageStatus = 'complete' | 'empty' | 'partial';

export type MaturityInvocationKind = 'audit' | 'feature' | 'manual' | 'profile' | 'skill';

export type MaturityArtifactKind =
	| 'audit-dynamic'
	| 'catalog'
	| 'fs-any'
	| 'fs-dir'
	| 'fs-file'
	| 'synthetic-changelog'
	| 'synthetic-feature'
	| 'synthetic-release';

export interface MaturityAuditEntry {
	ageDays: null | number;
	auditName: string;
	changes: AuditReportCodeChanges | null;
	freshness: 'fresh' | 'missing' | 'stale';
	lastReportAt: null | string;
	lastRunFinishedAt: null | string;
	lastRunId: null | string;
	lastRunStatus: 'failure' | 'success' | null;
	skipped: boolean;
	staleReasons: AuditReportStaleReason[];
}

export interface MaturityArtifact {
	audit?: MaturityAuditEntry;
	kind: MaturityArtifactKind;
	label: string;
	mtime: null | string;
	required: boolean;
	slug: string;
	status: MaturityArtifactStatus;
}

export interface MaturityStage {
	artifacts: MaturityArtifact[];
	complete: number;
	description: string;
	id: MaturityStageId;
	label: string;
	order: number;
	required: number;
	status: MaturityStageStatus;
}

export interface MaturityNextAction {
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

export interface MaturityStageStatusSummary {
	id: MaturityStageId;
	label: string;
	status: MaturityStageStatus;
}

export interface MaturityBadge {
	currentStageId: MaturityStageId | null;
	currentStageLabel: null | string;
	nextArtifactLabel: null | string;
	nextArtifactSlug: null | string;
	percent: number;
	stageStatuses: MaturityStageStatusSummary[];
}

export interface MaturityDetail extends MaturityBadge {
	auditProfileBucket: null | string;
	auditProfileLabel: null | string;
	nextAction: MaturityNextAction | null;
	skip: string[];
	stages: MaturityStage[];
}
