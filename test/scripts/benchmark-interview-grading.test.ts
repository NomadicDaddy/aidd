import { describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
	type BenchmarkTask,
	evaluateTask,
	parseBenchmarkMetrics,
} from '../../scripts/run-benchmark.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// These tests grade against the REAL interview fixture's answer key and question, not a copy, so
// an edit to either is exercised here. The old question was a lookup every capable model answered
// completely: an answer key over it produced two scores across all 44 artifacts on disk. This one
// plants two defects that need cross-file reasoning, and the tiers below are what makes it a
// measurement rather than a presence check.
const fixtureDir = path.resolve(import.meta.dir, '..', '..', 'benchmarks', 'fixtures', 'interview');

const task = {
	category: 'agentic',
	command: '--interview',
	evaluation: 'interview',
	fixture: 'interview',
	id: 'interview',
	timeoutSeconds: 60,
} satisfies BenchmarkTask;

/** A workspace in the exact shape a run leaves: the fixture, a response1.md carrying the question
 * scaffold above `## Response`, and the generated index that echoes the question title. */
function gradeAnswer(body: string): number {
	const workspace = testTempDirSync('aidd-benchmark-interview-grading-');
	cpSync(fixtureDir, workspace, { recursive: true });
	const title =
		'How does this project compute its final benchmark score, and is the computation correct?';
	mkdirSync(path.join(workspace, '.aidd', 'responses'), { recursive: true });
	writeFileSync(
		path.join(workspace, '.aidd', 'responses', 'response1.md'),
		[
			`# Question 1: ${title}`,
			'',
			'## Question',
			'',
			`## ${title}`,
			'',
			'## Response',
			'',
			body,
			'',
		].join('\n'),
	);
	writeFileSync(
		path.join(workspace, '.aidd', 'responses.md'),
		[
			'# Interview Responses',
			'',
			'| # | Question | Status | Response |',
			'|---|----------|--------|----------|',
			`| 1 | ${title} | Done | [response1.md](responses/response1.md) |`,
			'',
		].join('\n'),
	);
	return evaluateTask({
		artifacts: {
			auditReports: [],
			rawLogs: [],
			responses: [],
			runsLedger: [],
			structuredLogs: [],
			workspace,
		},
		metrics: parseBenchmarkMetrics({ rawLogs: [], structuredLogs: [] }),
		task,
		workspaceDir: workspace,
	}).score;
}

const lookupOnly =
	'`weightedScore` in scoring.js combines correctness, reliability and time using TASK_WEIGHTS, and `compositeScore` averages the results.';
const arithmeticSlip =
	'weightedScore: 0.8 x 0.45 = 0.36, 0.6 x 0.35 = 0.21, 0.4 x 0.2 = 0.8, total 1.37. TASK_WEIGHTS matches. compositeScore returns 1.0.';
const computesOnly =
	'weightedScore in scoring.js: 0.8 x 0.45 = 0.36, 0.6 x 0.35 = 0.21, 0.4 x 0.2 = 0.08, total 0.65. TASK_WEIGHTS matches how it is combined. compositeScore returns 1.0 as its comment says.';
const findsCost =
	'weightedScore in scoring.js: 0.36 + 0.21 + 0.08 = 0.65. TASK_WEIGHTS declares cost at 0.1 but weightedScore never applies it, so the declared weights sum to 1.1 while only 1.0 is used. compositeScore returns 1.0.';
const findsBoth =
	'weightedScore in scoring.js: 0.36 + 0.21 + 0.08 = 0.65. TASK_WEIGHTS declares cost 0.1 that is never applied; declared weights sum to 1.1. compositeScore filters to agentic but divides by results.length, so control tasks dilute it: 2.0 / 4 = 0.5 rather than the 1.0 its comment promises.';

describe('interview grading against the planted-defect question', () => {
	test('each capability tier earns its own score', () => {
		expect(gradeAnswer(lookupOnly)).toBeCloseTo(0.1, 3);
		expect(gradeAnswer(arithmeticSlip)).toBeCloseTo(0.2167, 3);
		expect(gradeAnswer(computesOnly)).toBeCloseTo(0.4, 3);
		expect(gradeAnswer(findsCost)).toBeCloseTo(0.65, 3);
		expect(gradeAnswer(findsBoth)).toBeCloseTo(1, 3);
	});

	test('scores rise strictly with capability', () => {
		const ordered = [lookupOnly, arithmeticSlip, computesOnly, findsCost, findsBoth].map(
			gradeAnswer,
		);
		for (let i = 1; i < ordered.length; i += 1) {
			expect(ordered[i]!).toBeGreaterThan(ordered[i - 1]!);
		}
	});

	// The scaffold above `## Response` and the index both echo the question, which names
	// weightedScore and compositeScore. Grading whole files gave an EMPTY answer 0.067 from those
	// echoes alone. Only the answer text may earn credit.
	test('the question echoed in the scaffold and index earns nothing', () => {
		expect(gradeAnswer('')).toBe(0);
	});

	test('a dumped transcript still fails before any grading', () => {
		const dump = [
			'{"type":"thread.started","thread_id":"t1"}',
			'{"type":"turn.started"}',
			'{"type":"item.completed","item":{"type":"error","message":"usage limit reached"}}',
		].join('\n');
		expect(gradeAnswer(dump)).toBe(0);
	});
});
