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
import { isProviderUnavailableExit } from './shared.ts';
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
		runs.map((run) => JSON.stringify(run)).join('\n') + (runs.length ? '\n' : ''),
	);
}

export function appendRun(runsPath: string, run: BenchmarkRun): void {
	appendFileSync(runsPath, `${JSON.stringify(run)}\n`);
}

export function writeOutputs(resultsDir: string, aggregateResult: BenchmarkAggregate): void {
	mkdirSync(resultsDir, { recursive: true });
	writeFileSync(
		path.join(resultsDir, 'leaderboard.json'),
		`${JSON.stringify(aggregateResult, null, 2)}\n`,
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
				].join(','),
			),
		].join('\n')}\n`,
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
	session: Record<string, unknown>,
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

/**
 * Status is otherwise left as recorded: a timeout or a success is a fact about the run, not a
 * grade. The one reclassification the saved exit code supports is a failure that was really the
 * provider refusing to serve. It needs no workspace, which matters because the runs it exists for
 * are old ones whose workspaces are often gone.
 */
function reclassifyProviderRefusal(run: BenchmarkRun): BenchmarkRun {
	if (run.status !== 'failure' || run.exitCode === undefined) return run;
	if (!isProviderUnavailableExit(run.exitCode)) return run;
	return { ...run, status: 'provider_unavailable' };
}

export function regradeRuns(
	manifest: BenchmarkManifest,
	runs: BenchmarkRun[],
): { changed: number; runs: BenchmarkRun[] } {
	let changed = 0;
	const regraded = runs.map((run): BenchmarkRun => {
		const graded = regradeRun(manifest, run);
		const reclassified = reclassifyProviderRefusal(graded.run);
		if (graded.changed || reclassified !== graded.run) changed += 1;
		return reclassified;
	});
	return { changed, runs: regraded };
}

function regradeRun(
	manifest: BenchmarkManifest,
	run: BenchmarkRun,
): { changed: boolean; run: BenchmarkRun } {
	const pricing = pricingForStack(run.stack, manifest);
	if (run.status === 'preflight_failed' || run.status === 'skipped') {
		const resolvedCost = resolveCost(run.costUsd, run.tokenUsage, pricing);
		if (resolvedCost === run.costUsd) return { changed: false, run };
		return { changed: true, run: { ...run, costUsd: resolvedCost } };
	}
	const task = manifest.tasks.find((candidate) => candidate.id === run.taskId);
	const workspaceDir = run.artifactPaths.workspace;
	if (!task || !workspaceDir || !existsSync(workspaceDir)) {
		// Workspace gone: correctness cannot be re-evaluated, but cost can still be
		// refreshed from the saved token usage.
		const resolvedCost = resolveCost(run.costUsd, run.tokenUsage, pricing);
		if (resolvedCost === run.costUsd) return { changed: false, run };
		return { changed: true, run: { ...run, costUsd: resolvedCost } };
	}
	const artifacts = detectArtifacts(workspaceDir);
	const metrics = parseBenchmarkMetrics({
		rawLogs: artifacts.rawLogs,
		structuredLogs: artifacts.structuredLogs,
	});
	const evaluation = evaluateTask({ artifacts, metrics, task, workspaceDir });
	const resolvedCost = resolveCost(metrics.costUsd, metrics.tokenUsage, pricing);
	const changed =
		JSON.stringify(evaluation.auditEval) !== JSON.stringify(run.auditEval) ||
		evaluation.score !== run.correctnessScore ||
		JSON.stringify(evaluation.notes) !== JSON.stringify(run.notes) ||
		resolvedCost !== run.costUsd;
	const updated: BenchmarkRun = {
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
	if (evaluation.auditEval) updated.auditEval = evaluation.auditEval;
	else delete updated.auditEval;
	return { changed, run: updated };
}
