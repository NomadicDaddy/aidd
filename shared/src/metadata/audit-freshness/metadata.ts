import { join } from 'node:path';

import { METADATA_DIR } from '../paths.ts';
import { currentGitHead, createAuditFreshnessContext } from './git.ts';

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

export interface AuditReportMetadata {
	generatedAt: string;
	gitHead: null | string;
	version: 1;
}

export const thresholds: AuditFreshnessThresholds = {
	codeCommits: AUDIT_CODE_CHANGE_THRESHOLDS.codeCommits,
	sourceFiles: AUDIT_CODE_CHANGE_THRESHOLDS.sourceFiles,
	sourceLines: AUDIT_CODE_CHANGE_THRESHOLDS.sourceLines,
	staleDays: AUDIT_STALE_THRESHOLD_DAYS,
};

export async function buildAuditReportMetadata(
	projectDir: string,
	timestamp = new Date()
): Promise<AuditReportMetadata> {
	const context = createAuditFreshnessContext();
	return {
		generatedAt: timestamp.toISOString(),
		gitHead: await currentGitHead(projectDir, context),
		version: 1,
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
		const parsed = JSON.parse(match[1]) as Partial<AuditReportMetadata>;
		if (parsed.version !== 1) return null;
		if (
			typeof parsed.generatedAt !== 'string' ||
			Number.isNaN(Date.parse(parsed.generatedAt))
		) {
			return null;
		}
		if (parsed.gitHead !== null && typeof parsed.gitHead !== 'string') return null;
		return {
			generatedAt: parsed.generatedAt,
			gitHead: parsed.gitHead ?? null,
			version: 1,
		};
	} catch {
		return null;
	}
}

function stripAuditReportMetadata(content: string): string {
	const pattern = new RegExp(
		`^<!--\\s*${AUDIT_FRESHNESS_METADATA_PREFIX}\\s+[^]*?\\s*-->\\r?\\n?`,
		'm'
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
