// Pure audit change-potential scoring. The collectors in `./collectors.ts` do the I/O;
// everything here is trivially testable and free of filesystem access.

import type { ProjectAuditEvidence } from './collectors.ts';

const PRIORITY_POINTS: Record<'Critical' | 'High' | 'Medium', number> = {
	Critical: 12,
	High: 8,
	Medium: 4,
};
const PRIORITY_FALLBACK_POINTS = 2;
const ACTIONABILITY_POINTS = 5;
const COMPLETED_POINTS = 6;
const COMPLETED_CAP = 60;
const INCOMPLETE_POINTS = 2;
const INCOMPLETE_CAP = 15;
const ACTIVE_FINDING_POINTS = 8;
const ACTIVE_FINDING_CAP = 32;
const MAX_SCORE = 100;

const HIGH_BAND_THRESHOLD = 60;
const MEDIUM_BAND_THRESHOLD = 30;

const HIGH_CONFIDENCE_COMPLETED_APPS = 3;
const HIGH_CONFIDENCE_REPORT_APPS = 4;
const MEDIUM_CONFIDENCE_REPORT_APPS = 3;

// Audits known to drive code-change remediation (create `.aidd/features/audit-*` entries
// or otherwise prompt edits). Reviewed when audits are added or change purpose. If this
// list churns, promote to an `actionable` frontmatter field on audit definitions.
export const ACTIONABLE_AUDITS: ReadonlySet<string> = new Set([
	'ARCHITECTURE',
	'BUILD_OUTPUT',
	'CODE_QUALITY',
	'COMPOSITION_PATTERNS',
	'DATABASE',
	'DEAD_CODE',
	'DEVOPS',
	'FEATURE_INTEGRATION',
	'FRONTEND',
	'HYGIENE',
	'LOGIC',
	'PERFORMANCE',
	'REACT_BEST_PRACTICES',
	'SCHEMA_CONSTRAINTS',
	'SECURITY',
	'TECHDEBT',
	'TESTING',
	'UI_PARITY',
	'WEB_DESIGN_GUIDELINES',
]);

export type AuditPriority = 'Critical' | 'High' | 'Medium';
export type Band = 'High' | 'Low' | 'Medium';
export type Confidence = 'High' | 'Low' | 'Medium';

export interface ScoreEvidence {
	actionable: boolean;
	activeAuditFeatures: number;
	appsWithAuditReports: number;
	appsWithCompletedFeatureEvidence: number;
	completedRunsWithFindings: number;
	incompleteAuditRuns: number;
	priority: AuditPriority | null;
}

export interface ChangePotential {
	band: Band;
	confidence: Confidence;
	evidence: ScoreEvidence;
	score: number;
}

export interface AuditScoreInput {
	activeAuditFeatures: number;
	appsWithAuditReports: number;
	appsWithCompletedFeatureEvidence: number;
	auditName: string;
	completedRunsWithFindings: number;
	incompleteAuditRuns: number;
	priority: AuditPriority | null;
}

export function scoreAudit(input: AuditScoreInput): ChangePotential {
	const upperName = input.auditName.toUpperCase();
	const actionable = ACTIONABLE_AUDITS.has(upperName);
	const priorityPoints =
		input.priority !== null ? PRIORITY_POINTS[input.priority] : PRIORITY_FALLBACK_POINTS;
	const actionabilityPoints = actionable ? ACTIONABILITY_POINTS : 0;
	const completedPoints = Math.min(
		input.completedRunsWithFindings * COMPLETED_POINTS,
		COMPLETED_CAP,
	);
	const incompletePoints = Math.min(
		input.incompleteAuditRuns * INCOMPLETE_POINTS,
		INCOMPLETE_CAP,
	);
	const activeFindingPoints = Math.min(
		input.activeAuditFeatures * ACTIVE_FINDING_POINTS,
		ACTIVE_FINDING_CAP,
	);
	const rawScore =
		priorityPoints +
		actionabilityPoints +
		completedPoints +
		incompletePoints +
		activeFindingPoints;
	const score = Math.min(rawScore, MAX_SCORE);
	return {
		band: bandFor(score),
		confidence: confidenceFor(input),
		evidence: {
			actionable,
			activeAuditFeatures: input.activeAuditFeatures,
			appsWithAuditReports: input.appsWithAuditReports,
			appsWithCompletedFeatureEvidence: input.appsWithCompletedFeatureEvidence,
			completedRunsWithFindings: input.completedRunsWithFindings,
			incompleteAuditRuns: input.incompleteAuditRuns,
			priority: input.priority,
		},
		score,
	};
}

function bandFor(score: number): Band {
	if (score >= HIGH_BAND_THRESHOLD) return 'High';
	if (score >= MEDIUM_BAND_THRESHOLD) return 'Medium';
	return 'Low';
}

function confidenceFor(input: AuditScoreInput): Confidence {
	if (
		input.appsWithCompletedFeatureEvidence >= HIGH_CONFIDENCE_COMPLETED_APPS ||
		input.appsWithAuditReports >= HIGH_CONFIDENCE_REPORT_APPS
	) {
		return 'High';
	}
	if (
		input.completedRunsWithFindings > 0 ||
		input.appsWithAuditReports >= MEDIUM_CONFIDENCE_REPORT_APPS
	) {
		return 'Medium';
	}
	return 'Low';
}

const PRIORITY_FRONTMATTER_PATTERN = /^\s*priority:\s*['"]?(Critical|High|Medium)['"]?\s*$/m;

export function extractPriorityFromFrontmatter(body: string): AuditPriority | null {
	const match = body.match(PRIORITY_FRONTMATTER_PATTERN);
	if (!match || !match[1]) return null;
	return match[1] as AuditPriority;
}

export interface ScoringContext {
	priorities: Map<string, AuditPriority | null>;
	projects: ProjectAuditEvidence[];
}

export function buildScoreInput(auditName: string, context: ScoringContext): AuditScoreInput {
	const upper = auditName.toUpperCase();
	let completedRunsWithFindings = 0;
	let incompleteAuditRuns = 0;
	let activeAuditFeatures = 0;
	let appsWithCompletedFeatureEvidence = 0;
	let appsWithAuditReports = 0;
	for (const project of context.projects) {
		completedRunsWithFindings += project.completedRunsWithFindings.get(upper) ?? 0;
		incompleteAuditRuns += project.incompleteAuditRuns.get(upper) ?? 0;
		activeAuditFeatures += project.activeAuditFeatures.get(upper) ?? 0;
		if (project.hasCompletedAuditFeature.has(upper)) appsWithCompletedFeatureEvidence++;
		if (project.hasAuditReport.has(upper)) appsWithAuditReports++;
	}
	return {
		activeAuditFeatures,
		appsWithAuditReports,
		appsWithCompletedFeatureEvidence,
		auditName: upper,
		completedRunsWithFindings,
		incompleteAuditRuns,
		priority: context.priorities.get(upper) ?? null,
	};
}

// Stable comparator for ranking: descending by score, ties broken alphabetically. Used
// by both the CLI (--audit-all ordering) and the frontend (default sort).
export function compareAuditsByChangePotential(
	leftName: string,
	rightName: string,
	scores: Map<string, ChangePotential>,
): number {
	const leftScore = scores.get(leftName.toUpperCase())?.score ?? -1;
	const rightScore = scores.get(rightName.toUpperCase())?.score ?? -1;
	if (leftScore !== rightScore) return rightScore - leftScore;
	return leftName.localeCompare(rightName);
}
