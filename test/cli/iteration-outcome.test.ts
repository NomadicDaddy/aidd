import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { classifyIterationOutcome } from '../../cli/src/orchestrator/run/iteration-outcome.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

const rootDir = join(import.meta.dir, '..', '..', '.tmp-iteration-outcome-tests');

const baseWork = {
	description: 'directive run',
	id: 'directive',
	kind: 'generic' as const,
};

const basePlan = {
	mode: 'directive' as const,
	projectDir: '',
} as Parameters<typeof classifyIterationOutcome>[0]['plan'];

afterEach(async () => {
	await removeTempTree(rootDir);
});

async function makeProjectDir(name: string): Promise<string> {
	const projectDir = join(rootDir, name);
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	return projectDir;
}

describe('classifyIterationOutcome', () => {
	test('directive run with no marker and no artifacts records missing_aidd_result', async () => {
		const projectDir = await makeProjectDir('no-artifacts');
		const startedAtMs = Date.now() - 1000;

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(true);
		expect(result.recordedExitCode).toBe(73);
	});

	test('directive run with fresh .aidd/ files does not record missing_aidd_result', async () => {
		const projectDir = await makeProjectDir('with-artifacts');
		// Simulate an artifact written during the run
		const reportDir = join(projectDir, '.aidd', 'audit-reports');
		await mkdir(reportDir, { recursive: true });
		const startedAtMs = Date.now();
		// Write the file after startedAtMs to simulate the backend writing it during the run
		await writeFile(
			join(reportDir, 'CODEBASE_ANALYSIS-2026-06-10.md'),
			'# Codebase Analysis\n\n293 lines of analysis.\n',
		);

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(0);
	});

	test('directive run with fresh top-level .aidd/ file does not record missing_aidd_result', async () => {
		const projectDir = await makeProjectDir('top-level-artifact');
		const startedAtMs = Date.now();
		// A real deliverable, not CHANGELOG.md: this case exists to prove top-level entries are
		// detected at all (not only children of subdirectories), and the changelog is now
		// deliberately excluded from counting as evidence.
		await writeFile(
			join(projectDir, '.aidd', 'project-structure.md'),
			'# Project Structure\n\n- backend/\n- frontend/\n',
		);

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(0);
	});

	test('placeholder AIDD_RESULT marker records missing_aidd_result and flags the malformed marker', async () => {
		const projectDir = await makeProjectDir('placeholder-marker');
		const startedAtMs = Date.now() - 1000;

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [
				{ chunk: 'The audit is complete.', type: 'assistant_text' },
				{ chunk: 'AIDD_RESULT: { … }', type: 'assistant_text' },
			],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.malformedResultMarker).toBe(true);
		expect(result.missingAiddResult).toBe(true);
		expect(result.recordedExitCode).toBe(73);
	});

	test('a run that emitted no marker at all is not flagged as a malformed marker', async () => {
		const projectDir = await makeProjectDir('no-marker');
		const startedAtMs = Date.now() - 1000;

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [{ chunk: 'I looked around and stopped.', type: 'assistant_text' }],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.malformedResultMarker).toBe(false);
		expect(result.missingAiddResult).toBe(true);
	});

	// run_1784565813011_7f576ced: a skill run that produced nothing wrote "blocked, awaiting a
	// decision" to .aidd/CHANGELOG.md and was certified complete — its actual deliverable,
	// .aidd/screen-map.md, was five days stale. Every prompt tells the agent to write the changelog,
	// so it appears on failure as readily as on success and cannot evidence completion.
	test('a changelog-only write does not count as directive completion', async () => {
		const projectDir = await makeProjectDir('changelog-only');
		const startedAtMs = Date.now();
		await writeFile(
			join(projectDir, '.aidd', 'CHANGELOG.md'),
			'## [2026-07-20]\n\n### Blocked\n\n- Could not run: required files missing.\n',
		);

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(true);
		expect(result.recordedExitCode).toBe(73);
	});

	// run_1784567400208_fac9c594: a skill run wrote no map, no changelog, made no commit and emitted
	// no marker, yet exited 0. aidd freshens .aidd/active-runs, .aidd/iterations and .aidd/runs.jsonl
	// itself on every run, so the check had become structurally always true — it measured that a run
	// happened, never that the agent produced anything.
	test('orchestrator bookkeeping is not completion evidence', async () => {
		const projectDir = await makeProjectDir('bookkeeping-only');
		const startedAtMs = Date.now();
		await mkdir(join(projectDir, '.aidd', 'active-runs'), { recursive: true });
		await mkdir(join(projectDir, '.aidd', 'iterations'), { recursive: true });
		await writeFile(join(projectDir, '.aidd', 'active-runs', 'run-1.json'), '{}');
		await writeFile(join(projectDir, '.aidd', 'iterations', '654.json'), '{}');
		await writeFile(join(projectDir, '.aidd', 'runs.jsonl'), '{"runId":"r1"}\n');

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(true);
		expect(result.recordedExitCode).toBe(73);
	});

	// Writing an excluded file into a directory moves that directory's mtime, which reinstated the
	// leak one level up until only regular files were counted.
	test('a directory freshened only by an excluded child is not evidence', async () => {
		const projectDir = await makeProjectDir('session-json-only');
		const startedAtMs = Date.now();
		await mkdir(join(projectDir, '.aidd', 'reports'), { recursive: true });
		await writeFile(
			join(projectDir, '.aidd', 'reports', 'session-pipe_123.json'),
			'{"session":true}',
		);

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(true);
	});

	// .aidd/runtime/ holds backend-written scratch — today the pipeline session metrics, rewritten
	// after every top-level step. Counting anything in it would reinstate the always-true check the
	// entry filtering exists to close, so the whole subtree is skipped by name rather than only the
	// one path that happens to sit deep enough to be missed by the two-level scan.
	test('files under runtime/ are not evidence at any depth', async () => {
		const projectDir = await makeProjectDir('runtime-scratch-only');
		const startedAtMs = Date.now();
		const sessionDir = join(projectDir, '.aidd', 'runtime', 'pipeline-sessions', 'pipe_123');
		await mkdir(sessionDir, { recursive: true });
		await writeFile(join(sessionDir, 'metrics.json'), '{"status":"running"}');
		// Directly under runtime/, where the two-level scan would otherwise see it.
		await writeFile(join(projectDir, '.aidd', 'runtime', 'scratch.json'), '{}');

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(true);
	});

	// reports/ holds real skill deliverables next to the session files, so it must not be excluded
	// wholesale — only the orchestrator's own session JSON is filtered.
	test('a real deliverable in reports/ still counts as completion', async () => {
		const projectDir = await makeProjectDir('report-deliverable');
		const startedAtMs = Date.now();
		await mkdir(join(projectDir, '.aidd', 'reports'), { recursive: true });
		await writeFile(
			join(projectDir, '.aidd', 'reports', 'session-pipe_123.json'),
			'{"session":true}',
		);
		await writeFile(
			join(projectDir, '.aidd', 'reports', 'feature-coverage-audit-2026-07-20.md'),
			'# Coverage\n\n- covered\n',
		);

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(0);
	});

	test('a changelog write alongside a real artifact still counts as completion', async () => {
		const projectDir = await makeProjectDir('changelog-plus-artifact');
		const startedAtMs = Date.now();
		await writeFile(
			join(projectDir, '.aidd', 'CHANGELOG.md'),
			'## [2026-07-20]\n\n- Did work.\n',
		);
		await writeFile(
			join(projectDir, '.aidd', 'screen-map.md'),
			'# Screen Map\n\n- /dashboard\n',
		);

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(0);
	});

	test('directive run with only stale .aidd/ files still records missing_aidd_result', async () => {
		const projectDir = await makeProjectDir('stale-artifacts');
		// Write a file well before the run start
		const staleTime = Date.now() - 60000;
		const startedAtMs = Date.now();
		// File is already stale relative to the run
		await writeFile(join(projectDir, '.aidd', 'old-file.md'), 'old content');

		// Touch the file to be in the past
		const { utimes } = await import('node:fs/promises');
		await utimes(
			join(projectDir, '.aidd', 'old-file.md'),
			new Date(staleTime),
			new Date(staleTime),
		);

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(true);
		expect(result.recordedExitCode).toBe(73);
	});

	test('verification-blocked park is not recorded as missing_aidd_result', async () => {
		const projectDir = await makeProjectDir('verification-blocked-park');
		const startedAtMs = Date.now() - 1000;

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: {
				artifacts: { verificationBlockedParked: 'feature-live' },
				complete: false,
				summary:
					'coding parked feature-live as waiting_approval (live verification blocked)',
			},
			plan: { ...basePlan, mode: 'coding' as const, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: { description: 'Live feature', id: 'feature-live', kind: 'feature' as const },
		});

		// The agent followed the STOP-AND-PARK hatch; an absent marker is the contract working,
		// not a missing result. Exit 0 so an --audit-findings sweep continues to the next finding.
		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(0);
	});

	test('coding mode run with fresh .aidd/ files still records missing_aidd_result', async () => {
		const projectDir = await makeProjectDir('coding-with-artifacts');
		const startedAtMs = Date.now();
		await writeFile(
			join(projectDir, '.aidd', 'CHANGELOG.md'),
			'## [2026-06-10]\n\n### Changed\n\n- Some change.\n',
		);

		const codingWork = {
			description: 'Feature work',
			id: 'feature-1',
			kind: 'feature' as const,
		};

		const warnings: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => void warnings.push(args.join(' '));
		let result;
		try {
			result = await classifyIterationOutcome({
				completedResultFeature: undefined,
				completionFinalizedBeforeBackendExit: false,
				events: [],
				exitCode: 0,
				iterationCommits: [],
				modeResult: { complete: true, summary: 'coding finished with exit code 0' },
				plan: { ...basePlan, mode: 'coding' as const, projectDir },
				startedAtMs,
				structuredResult: undefined,
				work: codingWork,
			});
		} finally {
			console.warn = originalWarn;
		}

		// Coding mode is NOT exempted by .aidd artifacts — only directive (generic) is
		expect(result.missingAiddResult).toBe(true);
		expect(result.recordedExitCode).toBe(73);
		// ...so the warning must not claim the .aidd check found nothing: it never ran, and
		// .aidd/ is frequently gitignored, meaning real on-disk writes sit here uncounted.
		const warning = warnings.find((line) => line.includes('missing_aidd_result'));
		expect(warning).toBeDefined();
		expect(warning).not.toContain('no .aidd artifacts');
		expect(warning).toContain('made no commits');
	});

	test('audit mode classification is unaffected by directive artifact check', async () => {
		const projectDir = await makeProjectDir('audit-mode');
		const reportDir = join(projectDir, '.aidd', 'audit-reports');
		await mkdir(reportDir, { recursive: true });
		const startedAtMs = Date.now();
		await writeFile(join(reportDir, 'SECURITY-2026-06-10.md'), '# Security Report\n');

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: {
				artifacts: { completedAudits: [], perAuditReportPaths: {} },
				complete: true,
				summary: 'audit finished',
			},
			plan: { ...basePlan, mode: 'audit' as const, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: { description: 'SECURITY audit', id: 'SECURITY', kind: 'generic' as const },
		});

		// Audit mode has its own missingAuditArtifacts check that takes priority
		expect(result.missingAuditArtifacts).toBe(true);
		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(73);
	});

	test('recognized invalid audit reports remain retryable without persisted artifacts', async () => {
		const projectDir = await makeProjectDir('audit-invalid-report');
		const structuredResult = { auditFindings: [], reportMarkdown: '# SECURITY' };

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: {
				artifacts: {
					completedAudits: [],
					invalidAuditReports: [
						{
							auditName: 'SECURITY',
							index: 0,
							reason: 'empty auditFindings requires evidence',
						},
					],
					missingAudits: ['SECURITY'],
					perAuditReportPaths: {},
				},
				complete: false,
				summary: 'audit report rejected; SECURITY remains pending',
			},
			plan: { ...basePlan, mode: 'audit' as const, projectDir },
			startedAtMs: Date.now(),
			structuredResult,
			work: { description: 'SECURITY audit', id: 'SECURITY', kind: 'generic' as const },
		});

		expect(result.missingAuditArtifacts).toBe(false);
		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(0);
	});

	test('phase work is exempt from missing_aidd_result regardless of artifacts', async () => {
		const projectDir = await makeProjectDir('phase-work');
		const startedAtMs = Date.now();

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'phase finished' },
			plan: { ...basePlan, projectDir },
			startedAtMs,
			structuredResult: undefined,
			work: { description: 'initializer phase', id: 'phase-init', kind: 'phase' as const },
		});

		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(0);
	});

	test('directive run with structured result does not record missing_aidd_result', async () => {
		const projectDir = await makeProjectDir('structured-result');

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs: Date.now(),
			structuredResult: { featureId: 'test', status: 'completed', passes: true },
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(0);
	});

	test('directive run with commits does not record missing_aidd_result', async () => {
		const projectDir = await makeProjectDir('with-commits');

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [{ hash: 'abc123', subject: 'feat: something' }],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs: Date.now(),
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(0);
	});

	test('killed background tasks at teardown are flagged alongside missing_aidd_result', async () => {
		const projectDir = await makeProjectDir('killed-background-tasks');

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [
				{
					chunk: '{"type":"system","subtype":"task_updated","task_id":"bzd1r2cw6","patch":{"status":"killed","end_time":1781214933295},"uuid":"653a100e","session_id":"abc"}\n',
					stream: 'stdout' as const,
					type: 'raw_log' as const,
				},
			],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'coding finished with exit code 0' },
			plan: { ...basePlan, mode: 'coding' as const, projectDir },
			startedAtMs: Date.now(),
			structuredResult: undefined,
			work: { description: 'Feature work', id: 'feature-1', kind: 'feature' as const },
		});

		expect(result.missingAiddResult).toBe(true);
		expect(result.endedWithKilledBackgroundTasks).toBe(true);
		expect(result.recordedExitCode).toBe(73);
	});

	test('completed background tasks do not set the killed-background-tasks flag', async () => {
		const projectDir = await makeProjectDir('completed-background-tasks');

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [
				{
					chunk: '{"type":"system","subtype":"task_updated","task_id":"bzd1r2cw6","patch":{"status":"completed","end_time":1781214933295},"uuid":"653a100e","session_id":"abc"}\n',
					stream: 'stdout' as const,
					type: 'raw_log' as const,
				},
			],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs: Date.now(),
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.endedWithKilledBackgroundTasks).toBe(false);
	});

	test('directive run with no .aidd/ directory records missing_aidd_result', async () => {
		const projectDir = join(rootDir, 'no-aidd-dir');
		await mkdir(projectDir, { recursive: true });

		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: { complete: true, summary: 'directive run finished with exit code 0' },
			plan: { ...basePlan, projectDir },
			startedAtMs: Date.now(),
			structuredResult: undefined,
			work: baseWork,
		});

		expect(result.missingAiddResult).toBe(true);
		expect(result.recordedExitCode).toBe(73);
	});

	test('interview iterations are exempt from missing_aidd_result classification', async () => {
		const projectDir = await makeProjectDir('interview-exempt');
		// A generate-questions attempt that wrote nothing: exit 0, no artifacts, no marker.
		// The mode's own bounded retry must see this iteration, not an exit-73 termination.
		const result = await classifyIterationOutcome({
			completedResultFeature: undefined,
			completionFinalizedBeforeBackendExit: false,
			events: [],
			exitCode: 0,
			iterationCommits: [],
			modeResult: {
				complete: false,
				summary:
					'interview questions generation attempted but no parseable questions file found',
			},
			plan: { ...basePlan, mode: 'interview' as const, projectDir },
			startedAtMs: Date.now() - 1000,
			structuredResult: undefined,
			work: {
				description: 'generate interview questions',
				id: 'generate-questions',
				kind: 'generic' as const,
			},
		});

		expect(result.missingAiddResult).toBe(false);
		expect(result.recordedExitCode).toBe(0);
	});
});
