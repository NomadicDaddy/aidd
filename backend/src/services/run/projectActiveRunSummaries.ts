import { eq } from 'drizzle-orm';

import type { RunRecord } from '../../types.ts';
import type { QueriesContext } from './queryContracts.ts';

import { runs } from '../../db/schema.ts';
import { listCliActiveRuns } from './cliActiveRuns.ts';

export interface ProjectActiveRunSummary {
	count: number;
	latestRunId: null | string;
}

type ActiveRunIdentity = Pick<RunRecord, 'id' | 'projectPath' | 'startedAt'>;

function activeRunProjectPathKey(path: string): string {
	const normalized = path.replaceAll('/', '\\');
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function summarizeActiveRunsForProjects(
	projectPaths: readonly string[],
	activeRuns: readonly ActiveRunIdentity[],
): Map<string, ProjectActiveRunSummary> {
	const summaries = new Map<string, ProjectActiveRunSummary>();
	const projectsByPathKey = new Map<string, string>();
	for (const projectPath of projectPaths) {
		projectsByPathKey.set(activeRunProjectPathKey(projectPath), projectPath);
		summaries.set(projectPath, { count: 0, latestRunId: null });
	}
	const seenRunIds = new Set<string>();
	const latestStartedAt = new Map<string, number>();
	for (const run of activeRuns) {
		if (seenRunIds.has(run.id)) continue;
		seenRunIds.add(run.id);
		const projectPath = projectsByPathKey.get(activeRunProjectPathKey(run.projectPath));
		if (!projectPath) continue;
		const summary = summaries.get(projectPath);
		if (!summary) continue;
		summary.count += 1;
		const previousStartedAt = latestStartedAt.get(projectPath);
		if (
			previousStartedAt === undefined ||
			run.startedAt > previousStartedAt ||
			(run.startedAt === previousStartedAt &&
				(summary.latestRunId === null || run.id.localeCompare(summary.latestRunId) > 0))
		) {
			summary.latestRunId = run.id;
			latestStartedAt.set(projectPath, run.startedAt);
		}
	}
	return summaries;
}

export async function listActiveRunSummaries(
	ctx: QueriesContext,
	projectPaths: readonly string[],
): Promise<Map<string, ProjectActiveRunSummary>> {
	const [webRuns, cliRuns] = await Promise.all([
		ctx.db
			.select({ id: runs.id, projectPath: runs.projectPath, startedAt: runs.startedAt })
			.from(runs)
			.where(eq(runs.status, 'running')),
		listCliActiveRuns(ctx),
	]);
	return summarizeActiveRunsForProjects(projectPaths, [
		...webRuns,
		...cliRuns.filter((run) => run.status === 'running'),
	]);
}
