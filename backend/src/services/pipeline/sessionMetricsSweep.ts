import { metadataPath } from 'aidd-shared/metadata/paths';
import { inArray } from 'drizzle-orm';
import { readdir, readFile, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebDatabase } from '../../db/client.ts';

import { pipelineSessions } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { pipelineSessionRuntimeDir, RUNTIME_GITIGNORE } from './sessionMetricsPath.ts';

// Historical location, before metrics moved under .aidd/runtime/. Matches the CLI's
// ORCHESTRATOR_OWNED_CHILD filter so the sweep collects exactly the files that check was
// written to ignore — and nothing else in reports/, which holds real deliverables.
const LEGACY_METRICS_FILE = /^session-(.*)\.json$/i;

/**
 * Boot-time entry point for the sweep: logs its own failure and never throws.
 *
 * Call it after session resume, so a session that just came back as `running` keeps its metrics
 * file; anything still on disk then belongs to a session that has finished or vanished. Boot must
 * not fail over housekeeping, and a sweep skipped today simply collects the same entries tomorrow.
 * @param db The panel database, read for the set of still-active sessions.
 * @returns Nothing; failures are logged rather than propagated.
 */
export async function sweepSessionMetricsAtBoot(db: WebDatabase): Promise<void> {
	try {
		await sweepSessionMetrics(db);
	} catch (err) {
		webLogger.warn({ err }, 'Pipeline session-metrics sweep failed at boot');
	}
}

/**
 * Removes pipeline session metrics that no live session can still need.
 *
 * The dumps are per-session scratch with no other owner: the writer creates them, one report
 * step reads them, and nothing else deletes them — left alone they accumulate by the hundreds
 * across a fleet. This is that missing owner, run once at boot (after session resume, so a
 * session that just came back as `running` keeps its file) and idempotent.
 *
 * Sweeping by directory listing rather than by database row also collects sessions whose rows
 * are gone and sessions that crashed before finalizing, which a row-driven delete would miss.
 * @param db The panel database, read for the set of still-active sessions.
 * @returns The number of metrics entries removed.
 */
export async function sweepSessionMetrics(db: WebDatabase): Promise<number> {
	const allSessions = await db
		.select({ id: pipelineSessions.id, projectPath: pipelineSessions.projectPath })
		.from(pipelineSessions);
	if (allSessions.length === 0) return 0;
	const activeRows = await db
		.select({ id: pipelineSessions.id })
		.from(pipelineSessions)
		.where(inArray(pipelineSessions.status, ['queued', 'running']));
	const active = new Set(activeRows.map((row) => row.id));
	const projectPaths = new Set(allSessions.map((row) => row.projectPath));
	let removed = 0;
	for (const projectPath of projectPaths) {
		removed += await sweepRuntimeDir(pipelineSessionRuntimeDir(projectPath), active);
		removed += await sweepLegacyReports(metadataPath(projectPath, 'reports'), active);
	}
	if (removed > 0) {
		recordDataMovement({
			category: 'metadata',
			operation: 'pipeline.sessionMetrics.sweep',
			status: 'success',
			summary: { count: removed },
			target: 'sessionMetrics',
		});
	}
	return removed;
}

/**
 * Removes `<runtimeDir>/<sessionId>/` for every session that is no longer active.
 * @param runtimeDir One project's pipeline-session runtime directory.
 * @param active Ids of sessions that are still queued or running.
 * @returns The number of session directories removed.
 */
async function sweepRuntimeDir(runtimeDir: string, active: ReadonlySet<string>): Promise<number> {
	const entries = await listDir(runtimeDir);
	if (entries === null) return 0;
	let removed = 0;
	for (const entry of entries) {
		if (active.has(entry)) continue;
		if (await remove(join(runtimeDir, entry))) removed += 1;
	}
	// Leaving an empty pipeline-sessions/ (and runtime/) in every project the panel has ever
	// touched would be a smaller version of the litter this sweep exists to remove.
	if (removed > 0 && (await listDir(runtimeDir))?.length === 0) {
		const runtimeRoot = join(runtimeDir, '..');
		await rmdir(runtimeDir).catch(() => undefined);
		await removeOwnGitignore(runtimeRoot);
		await rmdir(runtimeRoot).catch(() => undefined);
	}
	return removed;
}

/**
 * Deletes the panel's own `.aidd/runtime/.gitignore` once it is all that is left, so the empty
 * runtime directory can go too. A file with any other content is not the panel's to delete.
 * @param runtimeRoot One project's `.aidd/runtime` directory.
 */
async function removeOwnGitignore(runtimeRoot: string): Promise<void> {
	if ((await listDir(runtimeRoot))?.join() !== '.gitignore') return;
	const ignorePath = join(runtimeRoot, '.gitignore');
	const content = await readFile(ignorePath, 'utf8').catch(() => undefined);
	if (content === RUNTIME_GITIGNORE) await remove(ignorePath);
}

/**
 * Removes session metrics files that landed in `.aidd/reports/` instead of the runtime directory.
 *
 * Scoped to the exact `session-<id>.json` shape: reports/ is a deliverables namespace and the
 * markdown beside these files is user-visible work, so a broader prune would destroy it.
 * @param reportsDir One project's .aidd/reports directory.
 * @param active Ids of sessions that are still queued or running.
 * @returns The number of stray metrics files removed.
 */
async function sweepLegacyReports(
	reportsDir: string,
	active: ReadonlySet<string>,
): Promise<number> {
	const entries = await listDir(reportsDir);
	if (entries === null) return 0;
	let removed = 0;
	for (const entry of entries) {
		const sessionId = LEGACY_METRICS_FILE.exec(entry)?.[1];
		if (sessionId === undefined || active.has(sessionId)) continue;
		if (await remove(join(reportsDir, entry))) removed += 1;
	}
	return removed;
}

/**
 * Lists a directory without treating its absence as an error.
 * @param dir The directory to read.
 * @returns Its entries, or null when the directory does not exist or cannot be read.
 */
async function listDir(dir: string): Promise<null | string[]> {
	try {
		return await readdir(dir);
	} catch {
		return null;
	}
}

/**
 * Deletes a file or directory tree, reporting whether it went.
 *
 * Failures are swallowed rather than propagated: a boot-time sweep must never stop the panel
 * from starting, and on Windows a handle another process still holds surfaces here as EBUSY.
 * The entry is simply collected on the next boot.
 * @param target The file or directory tree to delete.
 * @returns True when the target was removed.
 */
async function remove(target: string): Promise<boolean> {
	try {
		await rm(target, { force: true, recursive: true });
		return true;
	} catch {
		return false;
	}
}
