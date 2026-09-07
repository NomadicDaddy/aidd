import {
	type FindingDismissalReason,
	findingDismissalReasons,
} from 'aidd-shared/contracts/finding-dispositions';

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
	updatedAt: null | string;
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
	completedAt?: string;
	createdAt?: string;
	dependencies?: string[];
	directory?: string | undefined;
	fingerprint?: string;
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

/**
 * Keys a ProjectFeature carries that the record on disk does not: `directory` is the folder
 * name, injected by the metadata store when it reads a feature, and `milestone` is stamped by
 * the API from roadmap.json. Neither survives a write — see NON_PERSISTED_FEATURE_KEYS in
 * shared/src/metadata/store/serialize.ts and ROADMAP_DERIVED_FEATURE_KEYS in the backend
 * feature mappers, which are the two declarations this list is checked against by a test.
 *
 * Everything else round-trips, `approval`, `blockingContext`, `fingerprint` and
 * `justFinishedAt` included, so this list is short on purpose and not a general denylist.
 */
export const DERIVED_FEATURE_KEYS: readonly string[] = ['directory', 'milestone'];

/**
 * The feature as feature.json holds it. A dialog offering `Raw feature.json` is making a claim
 * about a file on disk, and showing the API shape instead means an operator comparing the two
 * finds keys in the panel that are not in the file — and reasonably concludes the file is stale.
 */
export function onDiskFeature(feature: ProjectFeature): Record<string, unknown> {
	const onDisk: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(feature)) {
		if (DERIVED_FEATURE_KEYS.includes(key)) continue;
		onDisk[key] = value;
	}
	return onDisk;
}

export interface FindingDismissalInput {
	note?: string;
	reason: FindingDismissalReason;
}

export { findingDismissalReasons };
export type { FindingDismissalReason };
