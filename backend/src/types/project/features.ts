export interface WebFeatureStats {
	closed: number;
	dependencyBlocked: number;
	failing: number;
	open: number;
	passing: number;
	total: number;
	waitingApproval: number;
}

export interface WebFeatureSummaryDto {
	audit: number;
	completed: number;
	feature: number;
	pending: number;
	remediation: number;
	total: number;
}

export type WebFeatureStatusType = 'audit' | 'feature' | 'remediation';

export interface WebFeatureStatusEntryDto {
	completed: boolean;
	directory: string;
	id: string;
	priority: null | number | string;
	status: null | string;
	title: string;
	type: WebFeatureStatusType;
	updatedAt: null | string;
}

export interface ProjectFeatureDto {
	[key: string]: unknown;
	directory?: string | undefined;
	id: string;
	milestone?: null | string | undefined;
}
