import { z } from 'zod/v4';

// Why a feature was parked as waiting_approval: which gate command(s) failed, an excerpt of the
// failing output, and the machine reason. Persisted onto the feature record at parking time so the
// decision queue and the next run's agent can see what they are approving past instead of a blind
// bounce (see the waiting-approval-gate-context feature).
export const featureBlockingContextSchema = z.object({
	commands: z.array(z.string()),
	outcomeStatus: z.string().optional(),
	outputExcerpt: z.string(),
	parkedAt: z.string(),
	reason: z.string(),
});

export type FeatureBlockingContext = z.infer<typeof featureBlockingContextSchema>;

export const featureSchema = z
	.object({
		auditSource: z.string().optional(),
		blockingContext: featureBlockingContextSchema.optional(),
		category: z.string().optional(),
		dependencies: z.array(z.string()).optional(),
		description: z.string().optional(),
		directory: z.string().optional(),
		id: z.string(),
		passes: z.boolean().optional(),
		priority: z.union([z.number(), z.string()]).optional(),
		shippedVersion: z.string().optional(),
		status: z.string().optional(),
		title: z.string().optional(),
	})
	.passthrough();

export const FEATURE_ID_PATTERN =
	/^((feature|spernakit|audit-[a-z]+(-[a-z]+)*)-[0-9]+-[a-zA-Z0-9-]+|remediation(-[0-9]+)?-[a-zA-Z0-9-]+|[a-z][a-z0-9]*(-[a-z0-9]+)*)$/;

export type Feature = z.infer<typeof featureSchema>;

export interface FeatureQuery {
	featureDirectory?: string;
	filters?: { field: string; value: string }[];
	includeAudit?: boolean;
	milestoneFeatureDirectories?: string[];
}

export interface FeatureSelectionOptions {
	allFeatures?: Feature[];
	includeAudit?: boolean;
}

export interface FeatureStats {
	byCategoryPriority: {
		category: string;
		p1: number;
		p2: number;
		p3: number;
		p4: number;
		total: number;
	}[];
	closed: number;
	/** Unfinished features that selection would otherwise be free to pick but cannot, because their own
	 * dependencies are not all passing. Excludes `waiting_approval`, matching the eligibility test in
	 * `selectFeatureCandidates`: those are held by approval rather than topology, and counting them
	 * here would overstate how much work is unblockable by finishing prerequisites. Counted separately
	 * from `open` (which includes them) because a backlog that is large but mostly dependency-blocked
	 * needs unblocking work, not more features — a distinction invisible from the other counts. */
	dependencyBlocked: number;
	failing: number;
	open: number;
	passing: number;
	total: number;
	waitingApproval: number;
}

export type FeatureStatusType = 'audit' | 'feature' | 'remediation';

export interface FeatureValidationIssue {
	id: string;
	message: string;
	path?: string;
}

export interface FeatureValidationResult {
	issues: FeatureValidationIssue[];
	total: number;
	valid: boolean;
	warnings?: FeatureValidationIssue[];
}

export interface FeatureCollectionValidationResult {
	issues: FeatureValidationIssue[];
	warnings: FeatureValidationIssue[];
}
