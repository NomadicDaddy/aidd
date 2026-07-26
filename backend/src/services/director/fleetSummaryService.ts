import {
	defaultDirectorMaxPerBucket,
	defaultDirectorSuggestionGranularity,
} from 'aidd-shared/config';
import { count, eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type {
	ProjectLocalIterationDto,
	ProjectLocalRunDto,
	ProjectSummaryMetadataDto,
} from '../../types.ts';
import type { FleetSummary, FleetSummaryProject } from './types.ts';
import type { DirectorConfig } from './types.ts';

import { suggestions } from '../../db/schema.ts';
import {
	applyDirectorAuditPolicy,
	buildFleetPriorityHealth,
	directorPriorityOrder,
	expandTargetedWork,
	sortPrioritizedWork,
} from '../directorPriority.ts';
import { type ProjectService } from '../projectService.ts';
import { isArchivedProject } from './helpers.ts';

interface FileBackedRunResult {
	completedAt: null | string;
	status: null | string;
}

function timestampValue(value: null | string): number {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function sortTime(startedAt: null | string, endedAt: null | string): number {
	return Math.max(timestampValue(startedAt), timestampValue(endedAt));
}

function resultFromLocalRun(run: ProjectLocalRunDto): { sortTime: number } & FileBackedRunResult {
	let status = run.stopReason;
	if (!status && run.exitCode === 0) status = 'completed';
	if (!status && typeof run.exitCode === 'number') status = 'failed';
	return {
		completedAt: run.endedAt ?? run.startedAt,
		sortTime: sortTime(run.startedAt, run.endedAt),
		status,
	};
}

function resultFromLocalIteration(
	iteration: ProjectLocalIterationDto,
): { sortTime: number } & FileBackedRunResult {
	return {
		completedAt: iteration.endedAt ?? iteration.startedAt,
		sortTime: sortTime(iteration.startedAt, iteration.endedAt),
		status: iteration.status,
	};
}

function latestFileBackedRunResult(metadata: ProjectSummaryMetadataDto): FileBackedRunResult {
	const results = [
		...metadata.localRuns.map((run) => resultFromLocalRun(run)),
		...metadata.localIterations.map((iteration) => resultFromLocalIteration(iteration)),
	].filter((result) => result.sortTime > 0);
	const latest = results.sort((left, right) => right.sortTime - left.sortTime)[0];
	return latest
		? {
				completedAt: latest.completedAt,
				status: latest.status,
			}
		: { completedAt: null, status: null };
}

export class DirectorFleetSummaryService {
	private readonly db: WebDatabase;
	private readonly getConfig: () => DirectorConfig;
	private readonly projectService: ProjectService;

	constructor(db: WebDatabase, projectService: ProjectService, getConfig: () => DirectorConfig) {
		this.db = db;
		this.getConfig = getConfig;
		this.projectService = projectService;
	}

	async getFleetSummary(): Promise<FleetSummary> {
		const { projects } = await this.projectService.listProjectListings();
		const activeProjects = projects.filter((entry) => !isArchivedProject(entry.summary));
		const auditsEnabled = this.getConfig().auditsEnabled ?? true;
		// Aggregate count instead of fetching rows: the previous .limit(1000) row
		// fetch silently capped the reported pending total at 1000. Only the count
		// is consumed, so an exact COUNT(*) is both accurate and cheaper.
		const pendingCountPromise = this.db
			.select({ value: count() })
			.from(suggestions)
			.where(eq(suggestions.status, 'pending'));
		const [pendingCountRows, prioritySummaries] = await Promise.all([
			pendingCountPromise,
			Promise.resolve(
				activeProjects.map((entry) =>
					auditsEnabled
						? entry.prioritySummary
						: applyDirectorAuditPolicy(entry.summary, entry.prioritySummary, false),
				),
			),
		]);
		let completedFeatures = 0;
		let totalFeatures = 0;
		const rows: FleetSummaryProject[] = activeProjects.map((entry, index) => {
			const project = entry.summary;
			const lastRun = latestFileBackedRunResult(project.metadata);
			const prioritySummary = prioritySummaries[index]!;
			completedFeatures += project.featureStats.passing;
			totalFeatures += project.featureStats.total;
			const completion =
				project.featureStats.total === 0
					? 1
					: project.featureStats.passing / project.featureStats.total;
			const bySeverity = prioritySummary.backlog.audit.bySeverity;
			return {
				artifactCheck: project.metadata.artifactCheck,
				artifactHealth: project.artifactHealth,
				auditFindings: {
					bySeverity,
					total: Object.values(bySeverity).reduce((sum, count) => sum + count, 0),
				},
				auditHealth: prioritySummary.auditHealth,
				backlog: prioritySummary.backlog,
				completedCount: project.featureStats.passing,
				dependencyBlockedCount: project.featureStats.dependencyBlocked,
				featureCompletion: completion,
				featureCount: project.featureStats.total,
				lastRunResult: lastRun,
				phase: project.phase,
				priorityHealth: prioritySummary.priorityHealth,
				profile: project.metadata.profile,
				projectId: index + 1,
				slug: project.name,
			};
		});
		const priorityHealth = buildFleetPriorityHealth(rows);
		const featurePassRate =
			totalFeatures === 0 ? 100 : Math.round((completedFeatures / totalFeatures) * 100);
		// fleetHealthScore is the worst-project priority score (bucket ceiling minus penalty);
		// it is persisted via cycleService and used by director suggestions. It is NOT the
		// dashboard "Priority Health" headline — that uses featurePassRate.
		// Metric definitions of record: docs/reference/dashboard-metrics.md.
		const fleetHealthScore = priorityHealth.score;
		const suggestionsConfig = this.getConfig().director?.suggestions ?? {
			granularity: defaultDirectorSuggestionGranularity,
			maxPerBucket: defaultDirectorMaxPerBucket,
		};
		const prioritizedWork = sortPrioritizedWork(
			prioritySummaries.flatMap((summary) =>
				expandTargetedWork(summary.work, suggestionsConfig),
			),
		);
		const pendingCount = pendingCountRows[0]?.value ?? 0;
		return {
			aggregateErrors: {},
			fleetAggregations: {
				approvalCounts: { approved: 0, launched: 0, pending: pendingCount },
				featurePassRate,
				fleetHealthScore,
				priorityHealth,
				projectCount: activeProjects.length,
			},
			generatedAt: new Date().toISOString(),
			prioritizedWork,
			priorityOrder: directorPriorityOrder,
			projects: rows,
			signals: [],
			ttlSeconds: 900,
		};
	}
}
