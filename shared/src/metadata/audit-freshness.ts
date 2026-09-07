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
	type AuditReportFindingReference,
	type AuditReportFreshness,
	type AuditReportMetadata,
	auditReportPath,
	auditReportsDir,
	type AuditStaleReason,
	buildAuditReportMetadata,
	parseAuditReportMetadata,
	prependAuditReportMetadata,
	thresholds,
} from './audit-freshness/metadata.ts';

export {
	type AuditFreshnessContext,
	clearGitHistoryCache,
	createAuditFreshnessContext,
} from './audit-freshness/git.ts';
export {
	type AuditChangeCounts,
	type AuditReportFindingReference,
	type AuditReportFreshness,
	type AuditReportMetadata,
	auditReportPath,
	type AuditStaleReason,
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
	options: AuditFreshnessOptions = {},
): Promise<AuditReportFreshness> {
	const now = options.now ?? new Date();
	const context = options.context ?? createAuditFreshnessContext();
	const latest = await latestAuditReport(
		projectDir,
		auditName,
		options.excludedReportMarker,
		context,
	);
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
	timestamp = new Date(),
	findings: AuditReportFindingReference[] = [],
): Promise<string> {
	const path = auditReportPath(projectDir, auditName, timestamp);
	const metadata = await buildAuditReportMetadata(projectDir, timestamp, findings);
	const body = prependAuditReportMetadata(content, metadata);
	await mkdir(auditReportsDir(projectDir), { recursive: true });
	await writeFile(path, body.endsWith('\n') ? body : `${body}\n`);
	return path;
}

async function readReportDirEntries(
	reportDir: string,
	context?: AuditFreshnessContext,
): Promise<string[]> {
	const cache = context?.reportDirEntries;
	if (!cache) return await readdir(reportDir).catch(() => []);
	let pending = cache.get(reportDir);
	if (!pending) {
		pending = readdir(reportDir).catch(() => []);
		cache.set(reportDir, pending);
	}
	return await pending;
}

// Only the newest surviving report is ever returned, so stat the candidates first and read
// exactly the one that wins. Reading every historical report of every audit up front cost
// ~116 ms per request on a 335-file report directory to discard all but 39 of the bodies.
// When an excludedReportMarker is set the marker can only be seen in the content, so walk
// newest-first and read until one passes — the same result, and still one read in the
// common case where the newest report is not excluded.
async function latestAuditReport(
	projectDir: string,
	auditName: string,
	excludedReportMarker?: string,
	context?: AuditFreshnessContext,
): Promise<AuditReportSnapshot | null> {
	const reportDir = auditReportsDir(projectDir);
	const entries = await readReportDirEntries(reportDir, context);
	const matching = entries.filter(
		(entry) => entry.startsWith(`${auditName}-`) && entry.endsWith('.md'),
	);
	const stamped = await Promise.all(
		matching.map(async (entry) => {
			try {
				const stats = await stat(join(reportDir, basename(entry)));
				return { entry, mtimeMs: stats.mtimeMs };
			} catch {
				return null;
			}
		}),
	);
	const candidates = stamped
		.filter((item): item is { entry: string; mtimeMs: number } => item !== null)
		.sort((left, right) => right.mtimeMs - left.mtimeMs);
	for (const candidate of candidates) {
		let content: string;
		try {
			content = await readFile(join(reportDir, basename(candidate.entry)), 'utf8');
		} catch {
			continue;
		}
		if (excludedReportMarker && content.includes(excludedReportMarker)) continue;
		return {
			content,
			mtimeMs: candidate.mtimeMs,
			report: candidate.entry,
		} satisfies AuditReportSnapshot;
	}
	return null;
}

async function codeChangesSinceReport(
	projectDir: string,
	report: AuditReportSnapshot,
	metadata: AuditReportMetadata | null,
	context: AuditFreshnessContext,
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
