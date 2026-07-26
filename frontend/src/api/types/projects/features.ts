export interface FeatureStats {
	closed: number;
	dependencyBlocked: number;
	failing: number;
	open: number;
	passing: number;
	total: number;
	waitingApproval: number;
}

export interface FeatureSummary {
	audit: number;
	completed: number;
	feature: number;
	pending: number;
	remediation: number;
	total: number;
}

export type FeatureStatusType = 'audit' | 'feature' | 'remediation';

export interface FeatureStatusEntry {
	completed: boolean;
	directory: string;
	id: string;
	priority: null | number | string;
	status: null | string;
	title: string;
	type: FeatureStatusType;
}

export type ProjectFeatureStatus = 'backlog' | 'completed' | 'in_progress' | 'waiting_approval';

export interface ProjectFeatureApproval {
	approvedAt: string;
	decision: null | string;
	decisionRequired: boolean;
	source: string;
}

// Why a feature was parked as waiting_approval — the failing gate command(s), an output excerpt,
// and the machine reason. Persisted by the orchestrator at parking time (see the CLI
// buildFeatureBlockingContext helper) so the operator sees what they are approving past.
export interface ProjectFeatureBlockingContext {
	commands: string[];
	outcomeStatus?: string;
	outputExcerpt: string;
	parkedAt: string;
	reason: string;
}

export interface ProjectFeature {
	[key: string]: unknown;
	approval?: ProjectFeatureApproval;
	auditSource?: string;
	blockingContext?: ProjectFeatureBlockingContext;
	category?: string;
	createdAt?: string;
	dependencies?: string[];
	directory?: string | undefined;
	id: string;
	justFinishedAt?: null | string;
	milestone?: null | string | undefined;
	passes?: boolean;
	priority?: number | string;
	shippedVersion?: string;
	status?: string;
	title?: string;
	updatedAt?: string;
}
