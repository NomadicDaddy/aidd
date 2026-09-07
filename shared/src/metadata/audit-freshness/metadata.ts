import { join } from 'node:path';

import { METADATA_DIR } from '../paths.ts';
import { createAuditFreshnessContext, currentGitHead } from './git.ts';

export const AUDIT_FRESHNESS_METADATA_PREFIX = 'aidd:audit-report-meta';
export const AUDIT_STALE_THRESHOLD_DAYS = 30;

export const AUDIT_CODE_CHANGE_THRESHOLDS = {
	codeCommits: 10,
	sourceFiles: 25,
	sourceLines: 750,
} as const;

export type AuditFreshnessStatus = 'fresh' | 'missing' | 'stale';
export type AuditStaleReason = 'age' | 'code_commits' | 'source_files' | 'source_lines';

export interface AuditChangeCounts {
	codeCommits: number;
	sourceFiles: number;
	sourceLines: number;
}

export interface AuditFreshnessThresholds {
	codeCommits: number;
	sourceFiles: number;
	sourceLines: number;
	staleDays: number;
}

export interface AuditReportFreshness {
	ageDays: null | number;
	changes: AuditChangeCounts | null;
	gitInspected: boolean;
	lastReportAt: null | string;
	report: null | string;
	staleReasons: AuditStaleReason[];
	status: AuditFreshnessStatus;
	thresholds: AuditFreshnessThresholds;
}

export interface AuditReportFindingReference {
	featureId: string;
	fingerprint: string;
}

export interface AuditReportMetadataV1 {
	generatedAt: string;
	gitHead: null | string;
	version: 1;
}

export interface AuditReportMetadataV2 {
	findings: AuditReportFindingReference[];
	generatedAt: string;
	gitHead: null | string;
	version: 2;
}

export type AuditReportMetadata = AuditReportMetadataV1 | AuditReportMetadataV2;

export const thresholds: AuditFreshnessThresholds = {
	codeCommits: AUDIT_CODE_CHANGE_THRESHOLDS.codeCommits,
	sourceFiles: AUDIT_CODE_CHANGE_THRESHOLDS.sourceFiles,
	sourceLines: AUDIT_CODE_CHANGE_THRESHOLDS.sourceLines,
	staleDays: AUDIT_STALE_THRESHOLD_DAYS,
};

export async function buildAuditReportMetadata(
	projectDir: string,
	timestamp = new Date(),
	findings: AuditReportFindingReference[] = [],
): Promise<AuditReportMetadata> {
	const context = createAuditFreshnessContext();
	return {
		findings: findings.map((finding) => ({ ...finding })),
		generatedAt: timestamp.toISOString(),
		gitHead: await currentGitHead(projectDir, context),
		version: 2,
	};
}

export function prependAuditReportMetadata(content: string, metadata: AuditReportMetadata): string {
	const body = stripAuditReportMetadata(content);
	return `<!-- ${AUDIT_FRESHNESS_METADATA_PREFIX} ${JSON.stringify(metadata)} -->\n${body}`;
}

export function parseAuditReportMetadata(content: string): AuditReportMetadata | null {
	const pattern = new RegExp(`<!--\\s*${AUDIT_FRESHNESS_METADATA_PREFIX}\\s+([^]*?)\\s*-->`, 'm');
	const match = content.match(pattern);
	if (!match?.[1]) return null;
	try {
		const parsed = JSON.parse(match[1]) as Record<string, unknown>;
		if (parsed.version !== 1 && parsed.version !== 2) return null;
		if (
			typeof parsed.generatedAt !== 'string' ||
			Number.isNaN(Date.parse(parsed.generatedAt))
		) {
			return null;
		}
		if (parsed.gitHead !== null && typeof parsed.gitHead !== 'string') {
			return null;
		}
		if (parsed.version === 2) {
			const findings = parseFindingReferences(parsed.findings);
			// A malformed findings array loses only the finding links; the freshness fields are
			// intact and still decide whether the report is stale, so degrade to the version-1
			// header shape rather than treating the whole header as absent.
			if (findings !== null) {
				return {
					findings,
					generatedAt: parsed.generatedAt,
					gitHead: parsed.gitHead ?? null,
					version: 2,
				};
			}
		}
		return {
			generatedAt: parsed.generatedAt,
			gitHead: parsed.gitHead ?? null,
			version: 1,
		};
	} catch {
		return null;
	}
}

function parseFindingReferences(value: unknown): AuditReportFindingReference[] | null {
	if (!Array.isArray(value)) return null;
	const findings: AuditReportFindingReference[] = [];
	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) return null;
		const record = entry as Record<string, unknown>;
		if (
			typeof record.featureId !== 'string' ||
			record.featureId.length === 0 ||
			typeof record.fingerprint !== 'string' ||
			!/^f1-[a-f0-9]{64}$/.test(record.fingerprint)
		) {
			return null;
		}
		findings.push({ featureId: record.featureId, fingerprint: record.fingerprint });
	}
	return findings;
}

function stripAuditReportMetadata(content: string): string {
	const pattern = new RegExp(
		`^<!--\\s*${AUDIT_FRESHNESS_METADATA_PREFIX}\\s+[^]*?\\s*-->\\r?\\n?`,
		'm',
	);
	return content.replace(pattern, '');
}

export function auditReportsDir(projectDir: string): string {
	return join(projectDir, METADATA_DIR, 'audit-reports');
}

export function auditReportPath(projectDir: string, auditName: string, timestamp: Date): string {
	const safeAuditName = auditName.replace(/[^A-Za-z0-9_-]/g, '-');
	const date = timestamp.toISOString().slice(0, 10);
	return join(auditReportsDir(projectDir), `${safeAuditName}-${date}.md`);
}
