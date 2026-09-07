import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import type {
	BenchmarkArgs,
	BenchmarkManifest,
	BenchmarkPreflight,
	BenchmarkRun,
	BenchmarkStack,
	BenchmarkTask,
	CommandResult,
	RunMatrixItem,
	RunStatus,
} from './types.ts';

import { aggregate } from './aggregate.ts';
import { buildAiddInvocation, parseBenchmarkArgs } from './cli.ts';
import { repoRoot } from './constants.ts';
import { evaluateTask } from './evaluation.ts';
import {
	createWorkspace,
	detectArtifacts,
	executeAidd,
	fixturePathForTask,
	fixtureRootForManifest,
	hashFixture,
	hashTaskFixture,
	runCommand,
	workspaceName,
} from './execution.ts';
import { loadManifest } from './manifest.ts';
import { buildRunMatrix, matrixKey, runKey, selectManifest } from './matrix.ts';
import { parseBenchmarkMetrics } from './metrics.ts';
import { pricingForStack, resolveCost } from './pricing.ts';
import {
	appendRun,
	loadRuns,
	loadSession,
	preflightFromSession,
	regradeRuns,
	saveSession,
	writeOutputs,
	writeRuns,
} from './results.ts';
import { commandSucceeded, controlCommandSucceeded, readTextIfExists } from './shared.ts';

function buildRun(
	manifest: BenchmarkManifest,
	args: BenchmarkArgs,
	item: RunMatrixItem,
): BenchmarkRun {
	const sourceFixture = fixturePathForTask(args.manifest, item.task);
	if (!existsSync(sourceFixture)) throw new Error(`Fixture not found: ${sourceFixture}`);
	const workspaceDir = path.join(
		args.workspacesDir,
		workspaceName(item.stack, item.task, item.replicate, item.warmup),
	);
	createWorkspace(sourceFixture, workspaceDir);
	const sourceHash = hashTaskFixture(args.manifest, item.task);
	const { invocation, result } = executeAidd(
		item.stack,
		item.task,
		workspaceDir,
		manifest.settings.fixedEnv,
	);
	const artifacts = detectArtifacts(workspaceDir);
	const metrics = parseBenchmarkMetrics({
		rawLogs: artifacts.rawLogs,
		stderr: result.stderr,
		stdout: result.stdout,
		structuredLogs: artifacts.structuredLogs,
	});
	const evaluation = evaluateTask({
		artifacts,
		commandResult: result,
		metrics,
		task: item.task,
		workspaceDir,
	});
	const succeeded =
		item.task.category === 'control'
			? controlCommandSucceeded(result, metrics)
			: commandSucceeded(result, metrics);
	const status: RunStatus = result.timedOut ? 'timeout' : succeeded ? 'success' : 'failure';
	return {
		artifactPaths: artifacts,
		...(evaluation.auditEval ? { auditEval: evaluation.auditEval } : {}),
		command: [invocation.command, ...invocation.args],
		correctnessScore: evaluation.score,
		costUsd: resolveCost(
			metrics.costUsd,
			metrics.tokenUsage,
			pricingForStack(item.stack, manifest),
		),
		durationSeconds: metrics.durationSeconds || result.durationSeconds,
		fixtureHash: sourceHash,
		iterations: metrics.iterations,
		notes: evaluation.notes,
		replicate: item.replicate,
		stack: item.stack,
		status,
		taskId: item.task.id,
		tokenUsage: metrics.tokenUsage,
		workspaceHash: hashFixture(workspaceDir),
	};
}

function preflightTask(): BenchmarkTask {
	return {
		category: 'agentic',
		command: '--interview .aidd/questions.md --max-iterations 1',
		evaluation: 'preflight',
		fixture: 'preflight',
		id: 'preflight',
		timeoutSeconds: 180,
	};
}

export function preflightReady(result: CommandResult, corpus: string): boolean {
	return (
		/\bREADY\b/i.test(corpus) &&
		(result.status === orchestratorExitCodes.success ||
			result.status === orchestratorExitCodes.missingResult)
	);
}

function runPreflightForStack(
	manifest: BenchmarkManifest,
	args: BenchmarkArgs,
	stack: BenchmarkStack,
): BenchmarkPreflight {
	if (args.skipPreflight) {
		return {
			durationSeconds: 0,
			message: 'skipped',
			model: stack.model,
			ok: true,
			status: 'success',
		};
	}
	const task = {
		...preflightTask(),
		timeoutSeconds: manifest.settings.preflight.timeoutSeconds,
	};
	const sourceFixture = path.join(fixtureRootForManifest(args.manifest), 'preflight');
	const workspaceDir = path.join(args.workspacesDir, `preflight-${stack.label}`);
	createWorkspace(sourceFixture, workspaceDir);
	const { result } = executeAidd(stack, task, workspaceDir, manifest.settings.fixedEnv);
	const artifacts = detectArtifacts(workspaceDir);
	const corpus = [
		result.stdout,
		result.stderr,
		...artifacts.responses.map(readTextIfExists),
		...artifacts.structuredLogs.map(readTextIfExists),
	].join('\n');
	const ok = preflightReady(result, corpus);
	const preflight: BenchmarkPreflight = {
		durationSeconds: result.durationSeconds,
		model: stack.model,
		ok,
		status: ok ? 'success' : result.timedOut ? 'timeout' : 'preflight_failed',
	};
	if (!ok)
		preflight.message = (result.stderr || result.stdout || 'READY was not observed').trim();
	return preflight;
}

function gitHead(): string {
	const result = runCommand('git', ['rev-parse', 'HEAD'], repoRoot);
	return result.status === 0 ? result.stdout.trim() : 'unknown';
}

function logProgress(message: string): void {
	console.log(`[benchmark] ${message}`);
}

export function main(): void {
	const args = parseBenchmarkArgs(process.argv.slice(2));
	const manifest = loadManifest(args.manifest);
	const { stacks, tasks } = selectManifest(manifest, args);
	if (stacks.length === 0) throw new Error('No stacks selected');
	if (tasks.length === 0) throw new Error('No tasks selected');
	mkdirSync(args.resultsDir, { recursive: true });
	mkdirSync(args.workspacesDir, { recursive: true });

	const matrix = buildRunMatrix(manifest, stacks, tasks, args.seed);
	if (args.dryRun) {
		console.log(`Manifest: ${args.manifest}`);
		console.log(`Stacks: ${stacks.map((stack) => stack.label).join(', ')}`);
		console.log(`Tasks: ${tasks.map((task) => task.id).join(', ')}`);
		console.log(`Planned entries: ${matrix.length}`);
		for (const item of matrix) {
			const invocation = buildAiddInvocation(item.stack, item.task, '<workspace>');
			console.log(
				`${item.warmup ? 'warmup' : 'run'} ${item.stack.label} ${item.task.id} #${item.replicate}: ${[invocation.command, ...invocation.args].join(' ')}`,
			);
		}
		return;
	}

	if (args.regrade) {
		const runsPath = path.join(args.resultsDir, 'runs.jsonl');
		const priorSession = loadSession(args.resultsDir);
		const regrade = regradeRuns(manifest, loadRuns(runsPath));
		writeRuns(runsPath, regrade.runs);
		writeOutputs(
			args.resultsDir,
			aggregate(manifest, regrade.runs, preflightFromSession(priorSession)),
		);
		logProgress(`Regraded ${regrade.runs.length} saved runs (${regrade.changed} updated)`);
		return;
	}

	if (args.reportOnly) {
		const priorSession = loadSession(args.resultsDir);
		const runs = loadRuns(path.join(args.resultsDir, 'runs.jsonl'));
		writeOutputs(
			args.resultsDir,
			aggregate(manifest, runs, preflightFromSession(priorSession)),
		);
		logProgress(`Report rebuilt from ${runs.length} runs`);
		return;
	}

	const session: Record<string, unknown> = {
		aiddRepoCommit: gitHead(),
		manifest: path.relative(repoRoot, args.manifest).replaceAll(path.sep, '/'),
		preflight: {},
		runId: randomUUID(),
		startedAt: new Date().toISOString(),
	};
	logProgress(`Run ${session.runId} starting`);
	logProgress(`Results dir: ${args.resultsDir}`);
	logProgress(`Workspaces dir: ${args.workspacesDir}`);

	const preflight: Record<string, BenchmarkPreflight> = {};
	for (const stack of stacks) {
		logProgress(`Preflight ${stack.label}`);
		preflight[stack.label] = runPreflightForStack(manifest, args, stack);
	}
	session.preflight = preflight;
	saveSession(args.resultsDir, session);

	const eligible = new Set(
		Object.entries(preflight)
			.filter(([, result]) => result.ok)
			.map(([label]) => label),
	);
	const runsPath = path.join(args.resultsDir, 'runs.jsonl');
	const priorRuns = loadRuns(runsPath);
	// A prior run resumes only against the fixture and answer key it saw; a changed one reruns.
	const completedKeys = new Set(priorRuns.map((run) => `${runKey(run)}	${run.fixtureHash}`));
	let processed = 0;
	let resumed = 0;

	for (const item of matrix) {
		if (!eligible.has(item.stack.label)) {
			logProgress(`Skipping ${item.stack.label} ${item.task.id}: preflight failed`);
			continue;
		}
		const fixtureHash = existsSync(fixturePathForTask(args.manifest, item.task))
			? hashTaskFixture(args.manifest, item.task)
			: '';
		if (!item.warmup && completedKeys.has(`${matrixKey(item)}	${fixtureHash}`)) {
			resumed += 1;
			continue;
		}
		logProgress(
			`${item.warmup ? 'Warmup' : 'Run'} ${item.stack.label} ${item.task.id} #${item.replicate}`,
		);
		const run = buildRun(manifest, args, item);
		processed += 1;
		if (!item.warmup) {
			appendRun(runsPath, run);
			completedKeys.add(`${runKey(run)}	${run.fixtureHash}`);
		}
	}

	const allRuns = loadRuns(runsPath);
	writeOutputs(args.resultsDir, aggregate(manifest, allRuns, preflight));
	session.completedAt = new Date().toISOString();
	session.processed = processed;
	session.resumed = resumed;
	saveSession(args.resultsDir, session);
	logProgress(`Run complete: ${processed} processed, ${resumed} resumed`);
	logProgress(`Artifacts written to ${args.resultsDir}`);
}
