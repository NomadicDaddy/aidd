import type {
	AggregateRow,
	BenchmarkAggregate,
	BenchmarkManifest,
	BenchmarkPreflight,
	BenchmarkRun,
	BenchmarkScoring,
} from './types.ts';

import { clampScore } from './shared.ts';

function average(values: number[]): number {
	return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function computeCostScore(row: { averageCost: null | number }): null | number {
	if (row.averageCost === null) return null;
	return 1 / (1 + Math.max(0, row.averageCost));
}

function computeComposite(scoring: BenchmarkScoring, row: AggregateRow): number {
	// When cost is unknown (the backend reported neither dollars nor usable token
	// usage), redistribute the cost weight into correctness and reliability,
	// proportionally to their base weights, so an unmeasured stack is not credited
	// with a free cost score. A known $0 cost (e.g. local models) keeps the standard
	// cost term. This realizes the manifest's costPolicy.
	if (row.costScore === null) {
		const qualityWeight = scoring.correctnessWeight + scoring.reliabilityWeight;
		const scale = qualityWeight > 0 ? (qualityWeight + scoring.costWeight) / qualityWeight : 1;
		return clampScore(
			(row.averageCorrectness * scoring.correctnessWeight +
				row.reliability * scoring.reliabilityWeight) *
				scale +
				row.timeScore * scoring.timeWeight
		);
	}
	return clampScore(
		row.averageCorrectness * scoring.correctnessWeight +
			row.reliability * scoring.reliabilityWeight +
			row.timeScore * scoring.timeWeight +
			row.costScore * scoring.costWeight
	);
}

export function aggregate(
	manifest: BenchmarkManifest,
	runs: BenchmarkRun[],
	preflight: Record<string, BenchmarkPreflight>
): BenchmarkAggregate {
	const groups = new Map<string, BenchmarkRun[]>();
	const taskById = new Map(manifest.tasks.map((task) => [task.id, task]));
	for (const run of runs) {
		const key = `${run.stack.label}\t${run.taskId}`;
		groups.set(key, [...(groups.get(key) ?? []), run]);
	}
	const durations = runs.map((run) => run.durationSeconds).filter((value) => value > 0);
	const maxDuration = Math.max(...durations, 1);
	const rows: AggregateRow[] = [];
	for (const [key, group] of groups.entries()) {
		const [stackLabel = '', taskId = ''] = key.split('\t');
		const task = taskById.get(taskId);
		const successful = group.filter((run) => run.status === 'success');
		const averageDuration = average(group.map((run) => run.durationSeconds));
		const costs = group
			.map((run) => run.costUsd)
			.filter((value): value is number => typeof value === 'number');
		const row: AggregateRow = {
			averageCorrectness: average(group.map((run) => run.correctnessScore)),
			averageCost: costs.length > 0 ? average(costs) : null,
			averageDuration,
			category: task?.category ?? 'agentic',
			compositeScore: 0,
			costScore: 1,
			reliability: group.length > 0 ? successful.length / group.length : 0,
			runs: group.length,
			stackLabel,
			taskId,
			timeScore: 1 - averageDuration / maxDuration,
		};
		row.timeScore = clampScore(row.timeScore);
		row.costScore = computeCostScore(row);
		row.compositeScore = computeComposite(manifest.scoring, row);
		rows.push(row);
	}
	rows.sort(
		(a, b) => b.compositeScore - a.compositeScore || a.stackLabel.localeCompare(b.stackLabel)
	);
	const activePreflight = new Set(
		Object.entries(preflight)
			.filter(([, result]) => result.ok)
			.map(([label]) => label)
	);
	return {
		agenticRows: rows.filter((row) => row.category === 'agentic'),
		cohorts: manifest.cohorts.map((cohort) => ({
			members: cohort.members.filter(
				(member) => activePreflight.size === 0 || activePreflight.has(member)
			),
			name: cohort.name,
			rows: rows.filter((row) => cohort.members.includes(row.stackLabel)),
		})),
		controlRows: rows.filter((row) => row.category === 'control'),
		generatedAt: new Date().toISOString(),
		scoring: manifest.scoring,
	};
}

function formatScore(value: number): string {
	return value.toFixed(3);
}

export function renderReport(aggregateResult: BenchmarkAggregate): string {
	const lines = [
		'# aidd Benchmark Report',
		'',
		`Generated: ${aggregateResult.generatedAt}`,
		'',
		'## Agentic Leaderboard',
		'',
		'| Stack | Task | Runs | Correctness | Reliability | Seconds | Cost | Composite |',
		'| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
		...aggregateResult.agenticRows.map(
			(row) =>
				`| ${row.stackLabel} | ${row.taskId} | ${row.runs} | ${formatScore(row.averageCorrectness)} | ${formatScore(row.reliability)} | ${row.averageDuration.toFixed(1)} | ${row.averageCost === null ? 'unknown' : row.averageCost.toFixed(4)} | ${formatScore(row.compositeScore)} |`
		),
		'',
		'## Control Tasks',
		'',
		'| Stack | Task | Runs | Correctness | Reliability | Seconds |',
		'| --- | --- | ---: | ---: | ---: | ---: |',
		...aggregateResult.controlRows.map(
			(row) =>
				`| ${row.stackLabel} | ${row.taskId} | ${row.runs} | ${formatScore(row.averageCorrectness)} | ${formatScore(row.reliability)} | ${row.averageDuration.toFixed(1)} |`
		),
		'',
		'## Cohorts',
		'',
		...aggregateResult.cohorts.flatMap((cohort) => [
			`### ${cohort.name}`,
			'',
			`Members: ${cohort.members.join(', ') || 'none'}`,
			'',
		]),
	];
	return `${lines.join('\n')}\n`;
}
