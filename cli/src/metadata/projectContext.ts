import { METADATA_DIR, metadataPath } from 'aidd-shared/metadata/paths';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

const DEFAULT_CHANGELOG_LINE_LIMIT = 80;
const DEFAULT_REPORT_LIMIT = 3;
const CHANGELOG_MAX_BYTES = 16 * 1024;
const REPORT_EXCERPT_CHARS = 500;

export interface ChangelogDigest {
	recentLines: string;
	sourceExists: boolean;
	truncated: boolean;
}

export interface AuditReportSummary {
	date: string;
	excerpt: string;
	fileName: string;
	path: string;
}

export interface SessionReportSummary {
	date: string;
	fileName: string;
	path: string;
	title: string;
}

export interface AuditReportGroup {
	auditName: string;
	recent: AuditReportSummary[];
}

export interface ContextFilePresence {
	exists: boolean;
	relativePath: string;
}

export interface ProjectContextDigest {
	auditReports: AuditReportGroup[];
	changelog: ChangelogDigest;
	contextFile: ContextFilePresence;
	sessionReports: {
		recent: SessionReportSummary[];
	};
}

export interface LoadProjectContextOptions {
	auditNames?: string[];
	changelogLineLimit?: number;
	reportLimit?: number;
}

export async function loadProjectContext(
	projectDir: string,
	options: LoadProjectContextOptions = {},
): Promise<ProjectContextDigest> {
	const changelogLineLimit = options.changelogLineLimit ?? DEFAULT_CHANGELOG_LINE_LIMIT;
	const reportLimit = options.reportLimit ?? DEFAULT_REPORT_LIMIT;
	const auditNames = dedupeAuditNames(options.auditNames);

	const [changelog, auditReports, sessionReports, contextFile] = await Promise.all([
		loadChangelogDigest(projectDir, changelogLineLimit),
		loadAuditReportGroups(projectDir, auditNames, reportLimit),
		loadSessionReportSummaries(projectDir, reportLimit),
		probeContextFile(projectDir),
	]);

	return {
		auditReports,
		changelog,
		contextFile,
		sessionReports: { recent: sessionReports },
	};
}

export function isProjectContextEmpty(context: ProjectContextDigest): boolean {
	return (
		!context.changelog.sourceExists &&
		context.auditReports.length === 0 &&
		context.sessionReports.recent.length === 0 &&
		!context.contextFile.exists
	);
}

function dedupeAuditNames(auditNames: string[] | undefined): string[] {
	if (!auditNames || auditNames.length === 0) return [];
	const seen = new Set<string>();
	const result: string[] = [];
	for (const name of auditNames) {
		const trimmed = name.trim();
		if (trimmed.length === 0 || seen.has(trimmed)) continue;
		seen.add(trimmed);
		result.push(trimmed);
	}
	return result;
}

async function probeContextFile(projectDir: string): Promise<ContextFilePresence> {
	const relativePath = 'CONTEXT.md';
	try {
		await stat(join(projectDir, relativePath));
		return { exists: true, relativePath };
	} catch {
		return { exists: false, relativePath };
	}
}

async function loadAuditReportGroups(
	projectDir: string,
	auditNames: string[],
	limit: number,
): Promise<AuditReportGroup[]> {
	if (auditNames.length === 0) return [];
	const groups = await Promise.all(
		auditNames.map(async (auditName) => {
			const recent = await loadAuditReportSummaries(projectDir, auditName, limit);
			return { auditName, recent } satisfies AuditReportGroup;
		}),
	);
	return groups.filter((group) => group.recent.length > 0);
}

async function loadChangelogDigest(
	projectDir: string,
	lineLimit: number,
): Promise<ChangelogDigest> {
	const changelogPath = metadataPath(projectDir, 'CHANGELOG.md');
	let raw: string;
	try {
		raw = await readFile(changelogPath, 'utf8');
	} catch {
		return { recentLines: '', sourceExists: false, truncated: false };
	}

	const truncatedByBytes = raw.length > CHANGELOG_MAX_BYTES;
	const bounded = truncatedByBytes ? raw.slice(0, CHANGELOG_MAX_BYTES) : raw;
	const lines = bounded.split(/\r?\n/);
	const truncatedByLines = lines.length > lineLimit;
	const head = truncatedByLines ? lines.slice(0, lineLimit) : lines;

	return {
		recentLines: head.join('\n').trimEnd(),
		sourceExists: true,
		truncated: truncatedByBytes || truncatedByLines,
	};
}

async function loadAuditReportSummaries(
	projectDir: string,
	auditName: string | undefined,
	limit: number,
): Promise<AuditReportSummary[]> {
	const dir = metadataPath(projectDir, 'audit-reports');
	const prefix = auditName ? `${auditName}-` : undefined;
	const files = await listMarkdownFiles(dir, prefix);
	if (files.length === 0) return [];
	const sorted = await sortByMtimeDesc(dir, files);
	const top = sorted.slice(0, limit);
	return Promise.all(top.map((fileName) => buildAuditReportSummary(dir, fileName)));
}

async function loadSessionReportSummaries(
	projectDir: string,
	limit: number,
): Promise<SessionReportSummary[]> {
	const dir = metadataPath(projectDir, 'reports');
	const files = await listMarkdownFiles(dir);
	if (files.length === 0) return [];
	const sorted = await sortByMtimeDesc(dir, files);
	const top = sorted.slice(0, limit);
	return Promise.all(top.map((fileName) => buildSessionReportSummary(dir, fileName)));
}

async function listMarkdownFiles(dir: string, prefix?: string): Promise<string[]> {
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}
	return entries.filter((entry) => {
		if (!entry.endsWith('.md')) return false;
		if (prefix && !entry.startsWith(prefix)) return false;
		return true;
	});
}

async function sortByMtimeDesc(dir: string, fileNames: string[]): Promise<string[]> {
	const withStats = await Promise.all(
		fileNames.map(async (fileName) => {
			try {
				const info = await stat(join(dir, fileName));
				return { fileName, mtimeMs: info.mtimeMs };
			} catch {
				return { fileName, mtimeMs: 0 };
			}
		}),
	);
	return withStats.sort((a, b) => b.mtimeMs - a.mtimeMs).map((entry) => entry.fileName);
}

async function buildAuditReportSummary(dir: string, fileName: string): Promise<AuditReportSummary> {
	const filePath = join(dir, fileName);
	const date = extractDateFromFileName(fileName);
	const excerpt = await readExecutiveSummary(filePath);
	return {
		date,
		excerpt,
		fileName,
		path: `${METADATA_DIR}/audit-reports/${fileName}`,
	};
}

async function buildSessionReportSummary(
	dir: string,
	fileName: string,
): Promise<SessionReportSummary> {
	const filePath = join(dir, fileName);
	const date = extractDateFromFileName(fileName);
	const title = await readFirstHeading(filePath);
	return {
		date,
		fileName,
		path: `${METADATA_DIR}/reports/${fileName}`,
		title,
	};
}

const DATE_PATTERN = /(\d{4}-\d{2}-\d{2})/;

function extractDateFromFileName(fileName: string): string {
	const match = DATE_PATTERN.exec(fileName);
	return match?.[1] ?? '';
}

async function readExecutiveSummary(filePath: string): Promise<string> {
	let raw: string;
	try {
		raw = await readFile(filePath, 'utf8');
	} catch {
		return '';
	}
	const summaryStart = raw.search(/##\s+Executive Summary/i);
	const slice = summaryStart >= 0 ? raw.slice(summaryStart) : raw;
	const compact = slice.replace(/\r\n/g, '\n').trim();
	return compact.slice(0, REPORT_EXCERPT_CHARS).trim();
}

async function readFirstHeading(filePath: string): Promise<string> {
	let raw: string;
	try {
		raw = await readFile(filePath, 'utf8');
	} catch {
		return basename(filePath, '.md');
	}
	const lines = raw.split(/\r?\n/);
	for (const line of lines) {
		const match = /^#\s+(.+)/.exec(line.trim());
		if (match?.[1]) return match[1].trim();
	}
	return basename(filePath, '.md');
}
