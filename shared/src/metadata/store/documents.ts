import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AuditReportFindingReference } from '../audit-freshness.ts';

import { writeAuditReportWithMetadata } from '../audit-freshness.ts';

export async function generateChangelog(metadataDir: string): Promise<string> {
	try {
		return await readFile(join(metadataDir, 'CHANGELOG.md'), 'utf8');
	} catch {
		return '# Changelog\n\n';
	}
}

export async function writeChangelog(metadataDir: string, content?: string): Promise<string> {
	const changelog = content ?? (await generateChangelog(metadataDir));
	await mkdir(metadataDir, { recursive: true });
	await writeFile(join(metadataDir, 'CHANGELOG.md'), changelog);
	return changelog;
}

export async function listAuditReports(metadataDir: string): Promise<string[]> {
	try {
		return (await readdir(join(metadataDir, 'audit-reports'))).filter((entry) =>
			entry.endsWith('.md'),
		);
	} catch {
		return [];
	}
}

export async function readAuditReport(metadataDir: string, filename: string): Promise<string> {
	return await readFile(join(metadataDir, 'audit-reports', filename), 'utf8');
}

export async function writeAuditReport(
	projectDir: string,
	auditName: string,
	content: string,
	timestamp: Date,
	findings: AuditReportFindingReference[] = [],
): Promise<string> {
	return await writeAuditReportWithMetadata(projectDir, auditName, content, timestamp, findings);
}
