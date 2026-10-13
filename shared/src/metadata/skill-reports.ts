import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { writeFileAtomic } from '../lib/atomicWrite.ts';
import { metadataPath } from './paths.ts';

/** The first words of every report aidd saves, by which it knows its own files again. */
const PROVENANCE_PREFIX = '<!-- Saved by aidd from review-only';

function reportPath(projectDir: string, skillId: string, timestamp: Date, suffix: string): string {
	const safeSkillId = skillId.replace(/[^A-Za-z0-9_-]/g, '-');
	const date = timestamp.toISOString().slice(0, 10);
	return metadataPath(projectDir, 'reports', `${safeSkillId}-${date}${suffix}.md`);
}

/**
 * Where a review-only skill run's report is kept: `.aidd/reports/<skill>-YYYY-MM-DD.md`, beside the
 * other session reports the prompts already list. The date is the UTC day, the same convention the
 * audit reports use, so a second run of the same skill on the same day replaces that day's report.
 */
export function skillReportPath(projectDir: string, skillId: string, timestamp: Date): string {
	return reportPath(projectDir, skillId, timestamp, '');
}

/** True when nothing is at `path`, or what is there is a report aidd saved earlier. */
async function mayReplace(path: string): Promise<boolean> {
	try {
		return (await readFile(path, 'utf8')).startsWith(PROVENANCE_PREFIX);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true;
		throw err;
	}
}

/** The names tried, in order: the usual one, then `-aidd`, `-aidd-2` and so on. */
const FALLBACK_SUFFIXES = ['', '-aidd', '-aidd-2', '-aidd-3', '-aidd-4', '-aidd-5'];

/**
 * The first name that is free or already holds a report of aidd's. Every candidate gets the same
 * check, the fallbacks too: a person's file at `-aidd` is no more aidd's to replace than one at
 * the usual name. With every candidate taken by someone else's file the save fails, and the run is
 * recorded as incomplete, which is the safe outcome; nothing is overwritten to make room.
 */
async function freeReportPath(
	projectDir: string,
	skillId: string,
	timestamp: Date,
): Promise<string> {
	for (const suffix of FALLBACK_SUFFIXES) {
		const candidate = reportPath(projectDir, skillId, timestamp, suffix);
		if (await mayReplace(candidate)) return candidate;
	}
	const usual = skillReportPath(projectDir, skillId, timestamp);
	throw new Error(
		`${FALLBACK_SUFFIXES.length} files that aidd did not save already hold the names it would use, from ${usual} on`,
	);
}

/**
 * Save the report a review-only skill run returned. aidd writes it, not the agent: a review-only
 * run promises the operator that the agent changes nothing in the project, and that promise is
 * what stopped such a run from leaving its findings anywhere. The first line records where the
 * file came from, so a reader can tell it from a report an agent wrote for itself.
 *
 * That folder is ignored by git in most projects and people keep their own notes in it under the
 * same kind of name. A file aidd did not save is never replaced: the report then goes beside it as
 * `<skill>-YYYY-MM-DD-aidd.md` (or `-aidd-2` and on, if that is someone's too), and the returned
 * path says so.
 */
export async function writeSkillReport(
	projectDir: string,
	skillId: string,
	content: string,
	options: { runId?: string; timestamp?: Date } = {},
): Promise<string> {
	const timestamp = options.timestamp ?? new Date();
	const path = await freeReportPath(projectDir, skillId, timestamp);
	const run = options.runId === undefined ? '' : ` run ${options.runId}`;
	const provenance = `${PROVENANCE_PREFIX}${run} of skill ${skillId} at ${timestamp.toISOString()}. -->`;
	await mkdir(dirname(path), { recursive: true });
	await writeFileAtomic(path, `${provenance}\n\n${content.trim()}\n`);
	return path;
}
