import type { ChangePotential } from 'aidd-shared/metadata/audit-scoring';

import {
	type FindingLifecycleMeasures,
	measureFindingLifecycle,
	mergeFindingLifecycleMeasures,
} from 'aidd-shared/outcome-measures';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { AuditDefinitionDto } from '../audit/auditTypes.ts';
import type { AuditOutcomeMeasures, CostPerAcceptedFinding } from './types.ts';

import { runs } from '../../db/schema.ts';
import { canonicalProjectPath } from '../../paths.ts';
import { TERMINAL_STATUSES } from '../run/types.ts';
import { type AuditOutcomeCache, defaultAuditOutcomeCache } from './auditOutcomeCache.ts';

interface AuditCostAccumulator {
	/** Each captured run's share of its cost, keyed by run id; a bundled cost is split evenly. */
	costByRun: Map<string, number>;
	totalRuns: number;
}

interface LifecycleCollection {
	byAudit: Map<string, FindingLifecycleMeasures>;
	degradedProjects: number;
}

function auditIds(driverId: null | string): string[] {
	return driverId
		? driverId
				.split('+')
				.map((id) => id.trim().toUpperCase())
				.filter((id) => id.length > 0)
		: [];
}

/**
 * Rows carry the canonical spelling and the filter asks for it too; on win32 the comparison also
 * folds case, the way the run-history filters do, so a row stored under another spelling or a
 * fixture inserted directly still counts for its project.
 * @param projectPaths
 * @returns The project_path membership condition.
 */
function projectPathIn(projectPaths: readonly string[]): SQL {
	const canonical = [...new Set(projectPaths.map((path) => canonicalProjectPath(path)))];
	return process.platform === 'win32'
		? inArray(
				sql`lower(${runs.projectPath})`,
				canonical.map((path) => path.toLowerCase()),
			)
		: inArray(runs.projectPath, canonical);
}

async function collectLifecycleByAudit(
	projectPaths: readonly string[],
	cache: AuditOutcomeCache,
): Promise<LifecycleCollection> {
	const parts = new Map<string, FindingLifecycleMeasures[]>();
	let degradedProjects = 0;
	await Promise.all(
		projectPaths.map(async (projectPath) => {
			const outcomes = await cache.get(projectPath);
			if (outcomes.degraded) degradedProjects += 1;
			for (const [audit, measures] of outcomes.byAudit) {
				const existing = parts.get(audit);
				if (existing) existing.push(measures);
				else parts.set(audit, [measures]);
			}
		}),
	);
	const byAudit = new Map<string, FindingLifecycleMeasures>();
	for (const [audit, measures] of parts)
		byAudit.set(audit, mergeFindingLifecycleMeasures(measures));
	return { byAudit, degradedProjects };
}

async function collectCostsByAudit(
	db: undefined | WebDatabase,
	projectPaths: readonly string[],
): Promise<Map<string, AuditCostAccumulator>> {
	const costs = new Map<string, AuditCostAccumulator>();
	if (!db || projectPaths.length === 0) return costs;
	const rows = await db
		.select({ costUsd: runs.costUsd, driverId: runs.driverId, id: runs.id })
		.from(runs)
		.where(
			and(
				eq(runs.driverKind, 'audit'),
				inArray(runs.status, [...TERMINAL_STATUSES]),
				projectPathIn(projectPaths),
			),
		);
	for (const row of rows) {
		const audits = auditIds(row.driverId);
		for (const audit of audits) {
			const current = costs.get(audit) ?? { costByRun: new Map(), totalRuns: 0 };
			current.totalRuns += 1;
			// A batch run records one cost for every audit it ran; each audit carries an equal
			// share. A recorded zero is still a recorded cost.
			if (row.costUsd !== null) current.costByRun.set(row.id, row.costUsd / audits.length);
			costs.set(audit, current);
		}
	}
	return costs;
}

function costPerAcceptedFinding(
	lifecycle: FindingLifecycleMeasures,
	costs: AuditCostAccumulator | undefined,
): CostPerAcceptedFinding {
	let costUsd = 0;
	let costedAcceptedFindings = 0;
	for (const [runId, cost] of costs?.costByRun ?? []) {
		costUsd += cost;
		costedAcceptedFindings += lifecycle.remediatedByEmittingRun[runId] ?? 0;
	}
	return {
		acceptedFindings: lifecycle.remediated,
		capturedRuns: costs?.costByRun.size ?? 0,
		costedAcceptedFindings,
		totalRuns: costs?.totalRuns ?? 0,
		value: costedAcceptedFindings > 0 ? costUsd / costedAcceptedFindings : null,
	};
}

/**
 * Computes fleet audit outcomes entirely at read time from ledger events and run facts.
 * @param db
 * @param projectPaths
 * @param auditNames
 * @param cache Per-project ledger aggregation memo; the module default outside tests.
 * @returns Outcome measures keyed by normalized audit name.
 */
export async function collectAuditOutcomes(
	db: undefined | WebDatabase,
	projectPaths: readonly string[],
	auditNames: readonly string[],
	cache: AuditOutcomeCache = defaultAuditOutcomeCache,
): Promise<Map<string, AuditOutcomeMeasures>> {
	const uniquePaths = [...new Set(projectPaths)];
	const [lifecycles, costsByAudit] = await Promise.all([
		collectLifecycleByAudit(uniquePaths, cache),
		collectCostsByAudit(db, uniquePaths),
	]);
	return new Map(
		auditNames.map((name) => {
			const audit = name.toUpperCase();
			const lifecycle = lifecycles.byAudit.get(audit) ?? measureFindingLifecycle([]);
			return [
				audit,
				{
					acceptanceRate: lifecycle.acceptanceRate,
					costPerAcceptedFinding: costPerAcceptedFinding(
						lifecycle,
						costsByAudit.get(audit),
					),
					degradedProjects: lifecycles.degradedProjects,
					lifecycle,
					recurrenceRate: lifecycle.recurrenceRate,
				} satisfies AuditOutcomeMeasures,
			];
		}),
	);
}

/**
 * Joins read-time outcome measures and change-potential scores onto catalog definitions. A
 * definition without measures is returned as is, so one missing audit never blanks the catalog.
 * @param definitions
 * @param outcomes
 * @param scores
 * @returns Enriched catalog definitions.
 */
export function attachAuditOutcomes(
	definitions: readonly AuditDefinitionDto[],
	outcomes: ReadonlyMap<string, AuditOutcomeMeasures>,
	scores: ReadonlyMap<string, ChangePotential>,
): AuditDefinitionDto[] {
	return definitions.map((definition) => {
		const key = definition.name.toUpperCase();
		const outcome = outcomes.get(key);
		const score = scores.get(key);
		return {
			...definition,
			...(score ? { changePotential: score } : {}),
			...(outcome ? { outcome } : {}),
		};
	});
}
