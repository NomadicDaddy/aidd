import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { writeFileAtomic } from '../lib/atomicWrite.ts';
import { metadataPath } from './paths.ts';

/**
 * Where a review-only skill run's report is kept: `.aidd/reports/<skill>-YYYY-MM-DD.md`, beside the
 * other session reports the prompts already list. The date is the UTC day, the same convention the
 * audit reports use, so a second run of the same skill on the same day replaces that day's report.
 */
export function skillReportPath(projectDir: string, skillId: string, timestamp: Date): string {
	const safeSkillId = skillId.replace(/[^A-Za-z0-9_-]/g, '-');
	const date = timestamp.toISOString().slice(0, 10);
	return metadataPath(projectDir, 'reports', `${safeSkillId}-${date}.md`);
}

/**
 * Save the report a review-only skill run returned. aidd writes it, not the agent: a review-only
 * run promises the operator that the agent changes nothing in the project, and that promise is
 * what stopped such a run from leaving its findings anywhere. The first line records where the
 * file came from, so a reader can tell it from a report an agent wrote for itself.
 */
export async function writeSkillReport(
	projectDir: string,
	skillId: string,
	content: string,
	options: { runId?: string; timestamp?: Date } = {},
): Promise<string> {
	const timestamp = options.timestamp ?? new Date();
	const path = skillReportPath(projectDir, skillId, timestamp);
	const run = options.runId === undefined ? '' : ` run ${options.runId}`;
	const provenance = `<!-- Saved by aidd from review-only${run} of skill ${skillId} at ${timestamp.toISOString()}. -->`;
	const body = content.trim();
	await mkdir(dirname(path), { recursive: true });
	await writeFileAtomic(path, `${provenance}\n\n${body}\n`);
	return path;
}
