import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
	type AuditFreshnessContext,
	cachedGitNumstatOutput,
	createAuditFreshnessContext,
	isGitWorktree,
	parseGitNumstatLog,
} from './audit-freshness/git.ts';
import {
	AUDIT_CODE_CHANGE_THRESHOLDS,
	AUDIT_STALE_THRESHOLD_DAYS,
	type AuditChangeCounts,
	type AuditReportFreshness,
	type AuditReportMetadata,
	type AuditStaleReason,
	auditReportPath,
	auditReportsDir,
	buildAuditReportMetadata,
	parseAuditReportMetadata,
	prependAuditReportMetadata,
	thresholds,
} from './audit-freshness/metadata.ts';

export { type AuditFreshnessContext, createAuditFreshnessContext } from './audit-freshness/git.ts';
export {
	AUDIT_CODE_CHANGE_THRESHOLDS,
	AUDIT_FRESHNESS_METADATA_PREFIX,
	AUDIT_STALE_THRESHOLD_DAYS,
	type AuditChangeCounts,
	type AuditFreshnessStatus,
	type AuditFreshnessThresholds,
	type AuditReportFreshness,
	type AuditReportMetadata,
	type AuditStaleReason,
	auditReportPath,
	buildAuditReportMetadata,
	parseAuditReportMetadata,
	prependAuditReportMetadata,
} from './audit-freshness/metadata.ts';

interface AuditReportSnapshot {
	content: string;
	mtimeMs: number;
	report: string;
}

interface AuditFreshnessOptions {
	context?: AuditFreshnessContext;
	excludedReportMarker?: string;
	now?: Date;
}

export async function evaluateAuditReportFreshness(
	projectDir: string,
	auditName: string,
	options: AuditFreshnessOptions = {}
): Promise<AuditReportFreshness> {
	const now = options.now ?? new Date();
	const context = options.context ?? createAuditFreshnessContext();
	const latest = await latestAuditReport(projectDir, auditName, options.excludedReportMarker);
	if (!latest) {
		return {
			ageDays: null,
			changes: null,
			gitInspected: false,
			lastReportAt: null,
			report: null,
			staleReasons: [],
			status: 'missing',
			thresholds,
		};
	}

	const metadata = parseAuditReportMetadata(latest.content);
	const lastReportAt = metadata?.generatedAt ?? new Date(latest.mtimeMs).toISOString();
	const ageDays = Math.floor((now.getTime() - Date.parse(lastReportAt)) / 86_400_000);
	const staleReasons: AuditStaleReason[] = [];
	if (ageDays > AUDIT_STALE_THRESHOLD_DAYS) staleReasons.push('age');

	const changes = await codeChangesSinceReport(projectDir, latest, metadata, context);
	if (changes !== null) {
		if (changes.codeCommits >= AUDIT_CODE_CHANGE_THRESHOLDS.codeCommits) {
			staleReasons.push('code_commits');
		}
		if (changes.sourceFiles >= AUDIT_CODE_CHANGE_THRESHOLDS.sourceFiles) {
			staleReasons.push('source_files');
		}
		if (changes.sourceLines >= AUDIT_CODE_CHANGE_THRESHOLDS.sourceLines) {
			staleReasons.push('source_lines');
		}
	}

	return {
		ageDays,
		changes,
		gitInspected: changes !== null,
		lastReportAt,
		report: latest.report,
		staleReasons,
		status: staleReasons.length > 0 ? 'stale' : 'fresh',
		thresholds,
	};
}

export async function writeAuditReportWithMetadata(
	projectDir: string,
	auditName: string,
	content: string,
	timestamp = new Date()
): Promise<string> {
	const path = auditReportPath(projectDir, auditName, timestamp);
	const metadata = await buildAuditReportMetadata(projectDir, timestamp);
	const body = prependAuditReportMetadata(content, metadata);
	await mkdir(auditReportsDir(projectDir), { recursive: true });
	await writeFile(path, body.endsWith('\n') ? body : `${body}\n`);
	return path;
}

async function latestAuditReport(
	projectDir: string,
	auditName: string,
	excludedReportMarker?: string
): Promise<AuditReportSnapshot | null> {
	const reportDir = auditReportsDir(projectDir);
	let entries: string[];
	try {
		entries = await readdir(reportDir);
	} catch {
		return null;
	}
	const matching = entries.filter(
		(entry) => entry.startsWith(`${auditName}-`) && entry.endsWith('.md')
	);
	const snapshots = await Promise.all(
		matching.map(async (entry) => {
			try {
				const reportPath = join(reportDir, basename(entry));
				const [content, stats] = await Promise.all([
					readFile(reportPath, 'utf8'),
					stat(reportPath),
				]);
				if (excludedReportMarker && content.includes(excludedReportMarker)) return null;
				return {
					content,
					mtimeMs: stats.mtimeMs,
					report: entry,
				} satisfies AuditReportSnapshot;
			} catch {
				return null;
			}
		})
	);
	return (
		snapshots
			.filter((item): item is AuditReportSnapshot => item !== null)
			.sort((left, right) => right.mtimeMs - left.mtimeMs)[0] ?? null
	);
}

async function codeChangesSinceReport(
	projectDir: string,
	report: AuditReportSnapshot,
	metadata: AuditReportMetadata | null,
	context: AuditFreshnessContext
): Promise<AuditChangeCounts | null> {
	if (!(await isGitWorktree(projectDir, context))) return null;
	const args = metadata?.gitHead
		? ['log', '--numstat', '--format=commit:%H', `${metadata.gitHead}..HEAD`]
		: [
				'log',
				`--since=${new Date(report.mtimeMs).toISOString()}`,
				'--numstat',
				'--format=commit:%H',
			];
	const output = await cachedGitNumstatOutput(projectDir, args, context);
	if (output === null) return null;
	return parseGitNumstatLog(output);
}
