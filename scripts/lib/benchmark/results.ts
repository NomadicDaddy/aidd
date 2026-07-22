import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type {
	BenchmarkAggregate,
	BenchmarkManifest,
	BenchmarkPreflight,
	BenchmarkRun,
	RunStatus,
} from './types.ts';

import { renderReport } from './aggregate.ts';
import { evaluateTask } from './evaluation.ts';
import { detectArtifacts, hashFixture } from './execution.ts';
import { parseBenchmarkMetrics } from './metrics.ts';
import { pricingForStack, resolveCost } from './pricing.ts';
import { booleanValue, isRecord, numberValue, readJsonUnknown, stringValue } from './validation.ts';

export function loadRuns(runsPath: string): BenchmarkRun[] {
	if (!existsSync(runsPath)) return [];
	return readFileSync(runsPath, 'utf8')
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0)
		.map((line): BenchmarkRun => JSON.parse(line) as BenchmarkRun);
}

export function writeRuns(runsPath: string, runs: BenchmarkRun[]): void {
	writeFileSync(
		runsPath,
		runs.map((run) => JSON.stringify(run)).join('\n') + (runs.length ? '\n' : '')
	);
}

export function appendRun(runsPath: string, run: BenchmarkRun): void {
	appendFileSync(runsPath, `${JSON.stringify(run)}\n`);
}

export function writeOutputs(resultsDir: string, aggregateResult: BenchmarkAggregate): void {
	mkdirSync(resultsDir, { recursive: true });
	writeFileSync(
		path.join(resultsDir, 'leaderboard.json'),
		`${JSON.stringify(aggregateResult, null, 2)}\n`
	);
	const rows = [...aggregateResult.agenticRows, ...aggregateResult.controlRows];
	writeFileSync(
		path.join(resultsDir, 'leaderboard.csv'),
		`${[
			'stackLabel,taskId,category,averageCorrectness,reliability,averageDuration,averageCost,timeScore,costScore,compositeScore',
			...rows.map((row) =>
				[
					row.stackLabel,
					row.taskId,
					row.category,
					row.averageCorrectness,
					row.reliability,
					row.averageDuration,
					row.averageCost ?? '',
					row.timeScore,
					row.costScore ?? '',
					row.compositeScore,
				].join(',')
			),
		].join('\n')}\n`
	);
	writeFileSync(path.join(resultsDir, 'report.md'), renderReport(aggregateResult));
}

export function saveSession(resultsDir: string, session: Record<string, unknown>): void {
	writeFileSync(path.join(resultsDir, 'session.json'), `${JSON.stringify(session, null, 2)}\n`);
}

export function loadSession(resultsDir: string): Record<string, unknown> {
	const sessionPath = path.join(resultsDir, 'session.json');
	if (!existsSync(sessionPath)) return { preflight: {} };
	const parsed = readJsonUnknown(sessionPath);
	return isRecord(parsed) ? parsed : { preflight: {} };
}

export function preflightFromSession(
	session: Record<string, unknown>
): Record<string, BenchmarkPreflight> {
	const raw = isRecord(session.preflight) ? session.preflight : {};
	const result: Record<string, BenchmarkPreflight> = {};
	for (const [label, entry] of Object.entries(raw)) {
		if (!isRecord(entry)) continue;
		result[label] = {
			durationSeconds: numberValue(entry.durationSeconds) ?? 0,
			model: stringValue(entry.model) ?? '',
			ok: booleanValue(entry.ok) ?? false,
			status: (stringValue(entry.status) as RunStatus | undefined) ?? 'preflight_failed',
		};
	}
	return result;
}

export function regradeRuns(
	manifest: BenchmarkManifest,
	runs: BenchmarkRun[]
): { changed: number; runs: BenchmarkRun[] } {
	const taskById = new Map(manifest.tasks.map((task) => [task.id, task]));
	let changed = 0;
	const regraded = runs.map((run): BenchmarkRun => {
		const pricing = pricingForStack(run.stack, manifest);
		if (run.status === 'preflight_failed' || run.status === 'skipped') {
			const resolvedCost = resolveCost(run.costUsd, run.tokenUsage, pricing);
			if (resolvedCost === run.costUsd) return run;
			changed += 1;
			return { ...run, costUsd: resolvedCost };
		}
		const task = taskById.get(run.taskId);
		const workspaceDir = run.artifactPaths.workspace;
		if (!task || !workspaceDir || !existsSync(workspaceDir)) {
			// Workspace gone: correctness cannot be re-evaluated, but cost can still be
			// refreshed from the saved token usage.
			const resolvedCost = resolveCost(run.costUsd, run.tokenUsage, pricing);
			if (resolvedCost === run.costUsd) return run;
			changed += 1;
			return { ...run, costUsd: resolvedCost };
		}
		const artifacts = detectArtifacts(workspaceDir);
		const metrics = parseBenchmarkMetrics({
			rawLogs: artifacts.rawLogs,
			structuredLogs: artifacts.structuredLogs,
		});
		const evaluation = evaluateTask({ artifacts, metrics, task, workspaceDir });
		const resolvedCost = resolveCost(metrics.costUsd, metrics.tokenUsage, pricing);
		if (
			evaluation.score !== run.correctnessScore ||
			JSON.stringify(evaluation.notes) !== JSON.stringify(run.notes) ||
			resolvedCost !== run.costUsd
		) {
			changed += 1;
		}
		return {
			...run,
			artifactPaths: artifacts,
			correctnessScore: evaluation.score,
			costUsd: resolvedCost,
			durationSeconds: metrics.durationSeconds || run.durationSeconds,
			iterations: metrics.iterations,
			notes: evaluation.notes,
			tokenUsage: metrics.tokenUsage,
			workspaceHash: hashFixture(workspaceDir),
		};
	});
	return { changed, runs: regraded };
}
