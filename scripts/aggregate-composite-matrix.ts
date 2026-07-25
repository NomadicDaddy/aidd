#!/usr/bin/env bun
/*
 * One-shot aggregator: re-derive composite-component matrix across the
 * 25 canonical benchmark cells used in stack-review-20260525.md.
 *
 * Output: pretty markdown table on stdout.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Run = {
	correctnessScore: number;
	costUsd: null | number;
	durationSeconds: number;
	stack: {
		cli: string;
		label: string;
		model: string;
		reasoningEffort?: string;
	};
	status: string;
	taskId: string;
	tokenUsage?: {
		cachedTokens: number;
		inputTokens: number;
		known: boolean;
		outputTokens: number;
		reasoningTokens: number;
	};
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultResultsDir = join(repoRoot, 'benchmarks', 'results');

function parseResultsDir(args: string[]): string {
	let resultsDir = defaultResultsDir;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === '--results-dir') {
			const value = args[index + 1];
			if (!value || value.startsWith('--')) throw new Error('--results-dir requires a value');
			resultsDir = value;
			index++;
		} else if (arg?.startsWith('--results-dir=')) {
			const value = arg.slice('--results-dir='.length);
			if (!value) throw new Error('--results-dir requires a value');
			resultsDir = value;
		} else if (arg !== undefined) {
			throw new Error(`Unknown option: ${arg}`);
		}
	}
	return resolve(resultsDir);
}

const RESULTS_DIR = parseResultsDir(process.argv.slice(2));
const SOURCE_DIRS = [
	'first-pass-low-gpt-oss20b-no-opencode-20260524',
	'set3-medium-no-opencode-20260524',
	'set3-medium-opencode-20260524',
	'sets4-8-bundled-20260525',
	'set9-ollama-qwen36-latest-20260525-r2',
	'set10-ollama-qwen36-latest-thinking-20260525',
	'set11-ollama-qwen36-27b-20260525-r2',
	'glm52-opencode-kilocode-20260622',
	'lmstudio-gemma-e4b-64k',
	'lmstudio-gpt-oss-20b-64k',
];

const PRIMARY_AGENTIC_TASKS = ['interview', 'audit-primary', 'remediation', 'validate', 'quiz'];

// Stacks whose backend (opencode/kilocode) could not record token usage at run time, so their
// cost is unknown. The composite redistributes the cost weight into correctness/reliability for
// unknown-cost stacks, which inflates their score relative to stacks that pay a real cost term —
// so they are excluded here to avoid misrepresenting them on the leaderboard. They are superseded
// by the glm-5.2 opencode/kilocode stacks, which capture full token + cost data.
const EXCLUDE_STACKS = new Set([
	'kilocode-glm51-high',
	'kilocode-glm51-low',
	'kilocode-glm51-medium',
	'opencode-glm51-high',
	'opencode-glm51-low',
	'opencode-glm51-medium',
]);

type StackAgg = {
	cli: string;
	effort: string;
	label: string;
	model: string;
	tasks: Map<string, Run>;
};

const stacks = new Map<string, StackAgg>();

for (const dir of SOURCE_DIRS) {
	const path = join(RESULTS_DIR, dir, 'runs.jsonl');
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (err) {
		console.error(`! skip ${dir}: ${(err as Error).message}`);
		continue;
	}
	for (const line of raw.split('\n')) {
		if (!line.trim()) continue;
		const run = JSON.parse(line) as Run;
		if (!PRIMARY_AGENTIC_TASKS.includes(run.taskId)) continue;
		if (EXCLUDE_STACKS.has(run.stack.label)) continue;
		const key = run.stack.label;
		let agg = stacks.get(key);
		if (!agg) {
			agg = {
				cli: run.stack.cli,
				effort: run.stack.reasoningEffort ?? 'n/a',
				label: key,
				model: run.stack.model,
				tasks: new Map(),
			};
			stacks.set(key, agg);
		}
		// last-write wins per task — these directories shouldn't overlap on primary tasks
		agg.tasks.set(run.taskId, run);
	}
}

// time scoring is per-task percentile; we don't have all stacks per task here,
// so we recompute time score using max-duration normalization per task (matches
// scoring policy: timeScore = 1 - duration/maxDuration across the cohort).
const maxDurationByTask = new Map<string, number>();
for (const agg of stacks.values()) {
	for (const [taskId, run] of agg.tasks) {
		if (run.status !== 'success') continue;
		const cur = maxDurationByTask.get(taskId) ?? 0;
		if (run.durationSeconds > cur) maxDurationByTask.set(taskId, run.durationSeconds);
	}
}

type Row = {
	avgDurationSec: number;
	cachedTokens: number;
	composite: number;
	correctness: number;
	costScore: number;
	effort: string;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	reliability: number;
	stack: string;
	tasksCompleted: number;
	timeScore: number;
	tokensKnown: boolean;
	totalCostUsd: null | number;
	totalDurationSec: number;
};

const rows: Row[] = [];

for (const agg of stacks.values()) {
	let cSum = 0;
	let rSum = 0;
	let tSum = 0;
	let dSum = 0;
	let costSum = 0;
	let costKnown = false;
	let tokenIn = 0;
	let tokenOut = 0;
	let tokenReason = 0;
	let tokenCache = 0;
	let tokensKnownAny = false;
	let completed = 0;
	const n = PRIMARY_AGENTIC_TASKS.length;
	for (const taskId of PRIMARY_AGENTIC_TASKS) {
		const run = agg.tasks.get(taskId);
		if (!run) {
			// missing task counts as zero in correctness/reliability, max duration penalty
			continue;
		}
		const correctness = run.correctnessScore;
		const reliability = run.status === 'success' ? 1 : 0;
		const maxDur = maxDurationByTask.get(taskId) ?? run.durationSeconds;
		const timeScore = maxDur > 0 ? Math.max(0, 1 - run.durationSeconds / maxDur) : 1;
		const _costScore = 1; // unknown -> redistributed via weight; treat as neutral for view
		cSum += correctness;
		rSum += reliability;
		tSum += timeScore;
		dSum += run.durationSeconds;
		if (run.costUsd !== null) {
			costSum += run.costUsd;
			costKnown = true;
		}
		if (run.tokenUsage?.known) {
			tokenIn += run.tokenUsage.inputTokens;
			tokenOut += run.tokenUsage.outputTokens;
			tokenReason += run.tokenUsage.reasoningTokens;
			tokenCache += run.tokenUsage.cachedTokens;
			tokensKnownAny = true;
		}
		if (run.status === 'success') completed += 1;
	}
	const correctness = cSum / n;
	const reliability = rSum / n;
	const timeScore = tSum / n;
	// composite policy: if cost unknown, redistribute the 0.10 weight into
	// correctness (0.05) + reliability (0.05) proportionally to base weights.
	// We don't try to reproduce that exactly here; we report the published
	// "compositeScore" from leaderboard.json instead. Aggregate from leaderboards:
	rows.push({
		avgDurationSec: dSum / n,
		cachedTokens: tokenCache,
		composite: NaN, // filled later from leaderboard
		correctness,
		costScore: costKnown ? -1 : 1, // sentinel: real cost dollar value reported separately
		effort: agg.effort,
		inputTokens: tokenIn,
		outputTokens: tokenOut,
		reasoningTokens: tokenReason,
		reliability,
		stack: agg.label,
		tasksCompleted: completed,
		timeScore,
		tokensKnown: tokensKnownAny,
		totalCostUsd: costKnown ? costSum : null,
		totalDurationSec: dSum,
	});
}

// Pull published composite from each session's leaderboard.json (agenticRows category=agentic).
const publishedComposite = new Map<string, number[]>();
for (const dir of SOURCE_DIRS) {
	const path = join(RESULTS_DIR, dir, 'leaderboard.json');
	let lb: { agenticRows?: { compositeScore: number; stackLabel: string; taskId: string }[] };
	try {
		lb = JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		continue;
	}
	if (!lb.agenticRows) continue;
	for (const row of lb.agenticRows) {
		if (!PRIMARY_AGENTIC_TASKS.includes(row.taskId)) continue;
		if (EXCLUDE_STACKS.has(row.stackLabel)) continue;
		const arr = publishedComposite.get(row.stackLabel) ?? [];
		arr.push(row.compositeScore);
		publishedComposite.set(row.stackLabel, arr);
	}
}

for (const row of rows) {
	const arr = publishedComposite.get(row.stack);
	if (arr && arr.length > 0) {
		row.composite = arr.reduce((a, b) => a + b, 0) / arr.length;
	}
}

rows.sort((a, b) => b.composite - a.composite);

const fmtNum = (n: number, digits = 3) => (Number.isFinite(n) ? n.toFixed(digits) : 'n/a');
const _fmtInt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US') : 'n/a');
const fmtCost = (n: null | number) =>
	n === null || n === undefined ? 'unknown' : `$${n.toFixed(2)}`;
const fmtTokens = (n: number, known: boolean) => (known && n > 0 ? n.toLocaleString('en-US') : '—');

console.log(
	'| Stack | Effort | Composite | Correctness | Reliability | Time score | Avg dur (s) | Suite dur (s) | Suite cost | Input tokens | Output tokens | Reasoning tokens | Cached tokens |',
);
console.log(
	'| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
);
for (const r of rows) {
	console.log(
		`| ${r.stack} | ${r.effort} | ${fmtNum(r.composite)} | ${fmtNum(r.correctness)} | ${fmtNum(r.reliability)} | ${fmtNum(r.timeScore)} | ${fmtNum(r.avgDurationSec, 1)} | ${fmtNum(r.totalDurationSec, 1)} | ${fmtCost(r.totalCostUsd)} | ${fmtTokens(r.inputTokens, r.tokensKnown)} | ${fmtTokens(r.outputTokens, r.tokensKnown)} | ${fmtTokens(r.reasoningTokens, r.tokensKnown)} | ${fmtTokens(r.cachedTokens, r.tokensKnown)} |`,
	);
}
