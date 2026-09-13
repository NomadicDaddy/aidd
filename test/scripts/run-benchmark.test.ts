import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
	aggregate,
	type BenchmarkArtifacts,
	type BenchmarkManifest,
	type BenchmarkRun,
	type BenchmarkTask,
	buildAiddInvocation,
	estimateCostFromTokens,
	evaluateTask,
	loadManifest,
	parseBenchmarkMetrics,
	preflightReady,
	pricingForStack,
	regradeRuns,
	renderReport,
	resolveCost,
	splitCommandLine,
} from '../../scripts/run-benchmark.ts';
import {
	buildAiddOverrideEnv,
	fixturePathForTask,
	hashFixture,
	hashTaskFixture,
} from '../../scripts/lib/benchmark/execution.ts';
import { buildBackendSubprocessEnv } from 'aidd-shared/subprocess-env';

import { testTempDirSync } from '../_helpers/temp.ts';
const repoRoot = path.resolve(import.meta.dir, '..', '..');

describe('benchmark harness', () => {
	test('validates v2 backend names and rejects removed zrun backend', () => {
		const manifestPath = path.join(testTempDirSync('aidd-benchmark-'), 'manifest.json');
		writeFileSync(
			manifestPath,
			JSON.stringify({
				cohorts: [],
				scoring: {
					correctnessWeight: 0.45,
					costPolicy: 'unknown',
					costWeight: 0.1,
					reliabilityWeight: 0.25,
					timeWeight: 0.2,
				},
				stacks: [
					{
						cli: 'zrun',
						label: 'baseline',
						model: 'glm-5.3',
						view: 'native-best',
					},
				],
				tasks: [
					{
						category: 'control',
						command: '--version',
						fixture: 'preflight',
						id: 'version',
						timeoutSeconds: 60,
					},
				],
				version: 1,
			}),
		);

		expect(() => loadManifest(manifestPath)).toThrow('Unsupported benchmark backend');
	});

	test('admits Cline without adding an installation-specific default stack', () => {
		const defaultManifestPath = path.join(repoRoot, 'benchmarks', 'manifest.json');
		const manifest = JSON.parse(readFileSync(defaultManifestPath, 'utf8')) as BenchmarkManifest;
		expect(manifest.stacks.some((stack) => stack.cli === 'cline')).toBe(false);

		const manifestPath = path.join(testTempDirSync('aidd-benchmark-cline-'), 'manifest.json');
		manifest.stacks.push({
			cli: 'cline',
			label: 'cline-installation-default',
			model: 'installation-specific',
			view: 'cline',
		});
		writeFileSync(manifestPath, JSON.stringify(manifest));

		expect(loadManifest(manifestPath).stacks.at(-1)?.cli).toBe('cline');
	});

	test('builds v2 CLI invocations without extract-structured', () => {
		const manifest = loadManifest(path.join(repoRoot, 'benchmarks', 'manifest.json'));
		const stack = manifest.stacks.find((candidate) => candidate.cli === 'native');
		const task = manifest.tasks.find((candidate) => candidate.id === 'interview');
		expect(stack).toBeDefined();
		expect(task).toBeDefined();

		const invocation = buildAiddInvocation(stack!, task!, 'D:/tmp/workspace');
		expect(invocation.command).toBe('bun');
		expect(invocation.args).toContain(path.join(repoRoot, 'cli', 'src', 'index.ts'));
		expect(invocation.args).toContain('--project-dir');
		expect(invocation.args).toContain('--cli');
		expect(invocation.args).toContain('native');
		expect(invocation.args).toContain('--no-clean');
		expect(invocation.args).toContain('--no-work-backoff-ms');
		expect(invocation.args).toContain('--dirty-tree-threshold');
		expect(invocation.args).toContain('1000');
		expect(invocation.args).not.toContain('--extract-structured');
	});

	test('normalizes canonical benchmark stack controls', () => {
		const manifest = loadManifest(path.join(repoRoot, 'benchmarks', 'manifest.json'));
		const claudeMax = manifest.stacks.find(
			(candidate) => candidate.label === 'claude-code-opus48-max',
		);
		const codexXhigh = manifest.stacks.find(
			(candidate) => candidate.label === 'codex-gpt6-astra-xhigh',
		);
		const qwenThinking = manifest.stacks.find(
			(candidate) => candidate.label === 'ollama-qwen36-latest-thinking',
		);
		const gptOssLow = manifest.stacks.find(
			(candidate) => candidate.label === 'ollama-gpt-oss-20b-low',
		);
		const task = manifest.tasks.find((candidate) => candidate.id === 'version');
		expect(claudeMax?.reasoningEffort).toBe('max');
		expect(codexXhigh?.reasoningEffort).toBe('xhigh');
		expect(qwenThinking?.thinking).toBe(true);
		expect(gptOssLow?.thinkingLevel).toBe('low');
		expect(task).toBeDefined();

		const qwenInvocation = buildAiddInvocation(qwenThinking!, task!, 'D:/tmp/workspace');
		expect(qwenInvocation.args).toContain('--thinking');
		const gptOssInvocation = buildAiddInvocation(gptOssLow!, task!, 'D:/tmp/workspace');
		expect(gptOssInvocation.args).toContain('--thinking-level');
		expect(gptOssInvocation.args).toContain('low');
	});

	test('splits quoted benchmark command fragments', () => {
		expect(
			splitCommandLine('--audit "SECURITY,REACT_BEST_PRACTICES" --max-iterations 1'),
		).toEqual(['--audit', 'SECURITY,REACT_BEST_PRACTICES', '--max-iterations', '1']);
	});

	test('accepts preflight READY responses even when interview exits missing result', () => {
		const result = {
			durationSeconds: 1,
			status: 73,
			stderr: '',
			stdout: '',
			timedOut: false,
		};

		expect(preflightReady(result, '# Response\n\nREADY\n')).toBe(true);
		expect(preflightReady({ ...result, status: 72 }, '# Response\n\nREADY\n')).toBe(false);
		expect(preflightReady(result, '# Response\n\nstand by\n')).toBe(false);
	});

	test('keeps quiz fixture parseable as one interview question', () => {
		const questions = readFileSync(
			path.join(repoRoot, 'benchmarks', 'fixtures', 'quiz', '.aidd', 'questions.md'),
			'utf8',
		);
		const firstHeading = questions.match(/^## .*/m)?.[0] ?? '';
		expect(firstHeading).toContain('?');
		expect(questions).toContain('### Q1');
		expect(questions).toContain('### Q4');
	});

	test('extracts metrics from v2 iteration JSON', () => {
		const root = testTempDirSync('aidd-benchmark-metrics-');
		const structuredPath = path.join(root, '001.json');
		writeFileSync(
			structuredPath,
			JSON.stringify({
				durationMs: 2500,
				metrics: {
					costUsd: 0.25,
					errorCount: 1,
					inputTokens: 100,
					outputTokens: 40,
					rateLimitCount: 2,
				},
				outcome: {
					exitCode: 0,
					status: 'success',
				},
			}),
		);

		const metrics = parseBenchmarkMetrics({ structuredLogs: [structuredPath] });
		expect(metrics.durationSeconds).toBe(2.5);
		expect(metrics.iterations).toBe(1);
		expect(metrics.tokenUsage.inputTokens).toBe(100);
		expect(metrics.tokenUsage.outputTokens).toBe(40);
		expect(metrics.costUsd).toBe(0.25);
		expect(metrics.rateLimitCount).toBe(2);
		expect(metrics.errorCount).toBe(1);
		expect(metrics.exitStatus).toBe('success');
	});

	test('renders reports and regrades saved workspaces', () => {
		const root = testTempDirSync('aidd-benchmark-regrade-');
		const workspace = path.join(root, 'workspace');
		mkdirSync(path.join(workspace, '.aidd', 'responses'), { recursive: true });
		mkdirSync(path.join(workspace, '.aidd', 'iterations'), { recursive: true });
		writeFileSync(
			path.join(workspace, '.benchmark.expectations.json'),
			JSON.stringify({ responseFiles: ['.aidd/responses/response1.md'], type: 'interview' }),
		);
		writeFileSync(path.join(workspace, '.aidd', 'responses', 'response1.md'), 'answer\n');
		writeFileSync(
			path.join(workspace, '.aidd', 'iterations', '001.json'),
			JSON.stringify({
				durationMs: 1000,
				metrics: { inputTokens: 1, outputTokens: 2 },
				outcome: { exitCode: 0, status: 'success' },
			}),
		);
		const manifest = loadManifest(
			path.join(repoRoot, 'test', 'fixtures', 'benchmark', 'manifest.simulation.json'),
		);
		const stack = manifest.stacks[0]!;
		const task = manifest.tasks[0]!;
		const run = {
			artifactPaths: {
				auditReports: [],
				rawLogs: [],
				responses: [],
				runsLedger: [],
				structuredLogs: [],
				workspace,
			},
			command: ['bun'],
			correctnessScore: 0,
			costUsd: null,
			durationSeconds: 0,
			fixtureHash: 'fixture',
			iterations: 0,
			notes: ['old'],
			replicate: 0,
			stack,
			status: 'success',
			taskId: task.id,
			tokenUsage: {
				cachedTokens: 0,
				inputTokens: 0,
				known: false,
				outputTokens: 0,
				reasoningTokens: 0,
			},
			workspaceHash: 'workspace',
		} satisfies BenchmarkRun;

		const result = regradeRuns(manifest, [run]);
		expect(result.changed).toBe(1);
		expect(result.runs[0]?.correctnessScore).toBe(1);
		const report = renderReport(aggregate(manifest, result.runs, {}));
		expect(report).toContain('aidd Benchmark Report');
		expect(
			evaluateTask({
				artifacts: result.runs[0]!.artifactPaths,
				metrics: parseBenchmarkMetrics({
					structuredLogs: result.runs[0]!.artifactPaths.structuredLogs,
				}),
				task,
				workspaceDir: workspace,
			}).score,
		).toBe(1);
	});

	test('treats malformed feature JSON as missing during remediation scoring', () => {
		const root = testTempDirSync('aidd-benchmark-malformed-feature-');
		const workspace = path.join(root, 'workspace');
		const featureDir = path.join(workspace, '.aidd', 'features', 'remediation-bad-json');
		mkdirSync(featureDir, { recursive: true });
		writeFileSync(
			path.join(workspace, '.benchmark.expectations.json'),
			JSON.stringify({ featureId: 'remediation-bad-json', type: 'remediation' }),
		);
		writeFileSync(path.join(featureDir, 'feature.json'), '{ not valid json');

		const task = {
			category: 'agentic',
			command: '--feature remediation-bad-json',
			evaluation: 'remediation',
			fixture: 'malformed-feature',
			id: 'malformed-feature',
			timeoutSeconds: 60,
		} satisfies BenchmarkTask;
		const artifacts = {
			auditReports: [],
			rawLogs: [],
			responses: [],
			runsLedger: [],
			structuredLogs: [],
			workspace,
		} satisfies BenchmarkArtifacts;

		const result = evaluateTask({
			artifacts,
			metrics: parseBenchmarkMetrics({ rawLogs: [], structuredLogs: [] }),
			task,
			workspaceDir: workspace,
		});

		expect(result.notes).toContain('feature was not marked completed with passes=true');
		expect(result.notes).toContain('completed remediation feature is missing resolution notes');
		expect(result.score).toBe(0.4);
	});

	test('scores audit-eval tasks through the benchmark evaluation boundary', () => {
		const workspace = testTempDirSync('aidd-benchmark-audit-eval-');
		const featureDir = path.join(workspace, '.aidd', 'features', 'audit-security-xss');
		mkdirSync(featureDir, { recursive: true });
		writeFileSync(
			path.join(featureDir, 'feature.json'),
			JSON.stringify({
				auditSource: 'SECURITY',
				description:
					'renderDebugHtml in backend/src/server.ts emits unescaped HTML and permits XSS',
				id: 'audit-security-xss',
			}),
		);
		const task = {
			auditEval: {
				auditId: 'SECURITY',
				decoys: [
					{
						aliases: ['health endpoint'],
						auditId: 'SECURITY',
						file: 'backend/src/server.ts',
						id: 'public-health',
						severity: 'Info',
						symbol: 'health',
					},
				],
				defects: [
					{
						aliases: ['unescaped html', 'xss'],
						auditId: 'SECURITY',
						file: 'backend/src/server.ts',
						id: 'unescaped-debug-html',
						severity: 'High',
						symbol: 'renderDebugHtml',
					},
				],
				scoring: {
					lineTolerance: 3,
					precisionWeight: 0.5,
					recallWeight: 0.5,
					strictPrecision: false,
				},
			},
			category: 'agentic',
			command: '--audit SECURITY',
			evaluation: 'audit-eval',
			fixture: 'security',
			id: 'security-planted-defects',
			timeoutSeconds: 60,
		} satisfies BenchmarkTask;
		const result = evaluateTask({
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
		});

		expect(result.auditEval?.matchedDefectIds).toEqual(['unescaped-debug-html']);
		expect(result.auditEval?.missedDefectIds).toEqual([]);
		expect(result.auditEval?.spuriousFindingIds).toEqual([]);
		expect(result.score).toBe(1);
	});

	test('keys a fixture on its files and its answer key', () => {
		const manifestPath = path.join(repoRoot, 'evals', 'audits', 'manifest.json');
		const task = (loadManifest(manifestPath) as BenchmarkManifest).tasks.find(
			(candidate) => candidate.auditEval,
		)!;
		const files = hashFixture(fixturePathForTask(manifestPath, task));
		const keyed = hashTaskFixture(manifestPath, task);
		expect(keyed).not.toBe(files);
		expect(hashTaskFixture(manifestPath, structuredClone(task))).toBe(keyed);
		// Widening one alias changes the answer key, so every run scored before it is stale.
		const widened = structuredClone(task);
		widened.auditEval!.defects[0]!.aliases.push('another alias');
		expect(hashTaskFixture(manifestPath, widened)).not.toBe(keyed);
		// A task without a catalog hashes its files alone.
		const plain = { ...task };
		delete plain.auditEval;
		expect(hashTaskFixture(manifestPath, plain)).toBe(files);
	});

	test('control check task treats validationError exit as a successful run', () => {
		const workspace = testTempDirSync('aidd-benchmark-control-');
		const task = {
			category: 'control',
			command: '--check-artifacts',
			evaluation: 'check-artifacts',
			fixture: 'validate',
			id: 'check-artifacts',
			timeoutSeconds: 60,
		} satisfies BenchmarkTask;
		const artifacts = {
			auditReports: [],
			rawLogs: [],
			responses: [],
			runsLedger: [],
			structuredLogs: [],
			workspace,
		} satisfies BenchmarkArtifacts;
		const metrics = parseBenchmarkMetrics({ rawLogs: [], structuredLogs: [] });
		const base = { durationSeconds: 1, stderr: '', stdout: '', timedOut: false };

		// validationError (7) means the check ran and reported incomplete artifacts -> success.
		expect(
			evaluateTask({
				artifacts,
				commandResult: { ...base, status: 7 },
				metrics,
				task,
				workspaceDir: workspace,
			}).score,
		).toBe(1);
		// exit 0 -> success.
		expect(
			evaluateTask({
				artifacts,
				commandResult: { ...base, status: 0 },
				metrics,
				task,
				workspaceDir: workspace,
			}).score,
		).toBe(1);
		// a genuine crash/other failure exit is still scored as a failed run.
		expect(
			evaluateTask({
				artifacts,
				commandResult: { ...base, status: 1 },
				metrics,
				task,
				workspaceDir: workspace,
			}).score,
		).toBe(0);
	});

	test('runs no-model simulation benchmark and report-only mode', () => {
		const root = testTempDirSync('aidd-benchmark-sim-');
		const resultsDir = path.join(root, 'results');
		const workspacesDir = path.join(root, 'workspaces');
		const manifestPath = path.join(
			repoRoot,
			'test',
			'fixtures',
			'benchmark',
			'manifest.simulation.json',
		);
		// The benchmark drives the real CLI, which resolves its data directory from the aidd
		// install root — this working copy — regardless of --project-dir. Before the log path was
		// claimed, every replicate wrote its transcript into the developer's live
		// `data/run-logs`, so the suite silently deposited simulation runs in real run history.
		const liveRunLogs = path.join(repoRoot, 'data', 'run-logs');
		const before = new Set(existsSync(liveRunLogs) ? readdirSync(liveRunLogs) : []);
		const run = spawnSync(
			'bun',
			[
				'scripts/run-benchmark.ts',
				'--manifest',
				manifestPath,
				'--results-dir',
				resultsDir,
				'--workspaces-dir',
				workspacesDir,
				'--skip-preflight',
				'--seed',
				'test',
			],
			{ cwd: repoRoot, encoding: 'utf8', windowsHide: true },
		);
		expect(run.status).toBe(0);

		// A user-owned panel run can legitimately add a log here while the suite runs, so this
		// asserts attribution rather than an unchanged directory: nothing new may reference this
		// benchmark's disposable workspaces.
		const added = existsSync(liveRunLogs)
			? readdirSync(liveRunLogs).filter((name) => !before.has(name))
			: [];
		for (const name of added) {
			expect(readFileSync(path.join(liveRunLogs, name), 'utf8')).not.toContain(root);
		}
		const transcripts = readdirSync(workspacesDir).filter((name) => name.endsWith('.run.log'));
		expect(transcripts.length).toBeGreaterThan(0);
		expect(readFileSync(path.join(workspacesDir, transcripts[0] ?? ''), 'utf8')).toContain(
			'AIDD_RESULT',
		);
		const runsJsonl = readFileSync(path.join(resultsDir, 'runs.jsonl'), 'utf8');
		expect(runsJsonl).toContain('"taskId":"interview"');

		const reportOnly = spawnSync(
			'bun',
			[
				'scripts/run-benchmark.ts',
				'--manifest',
				manifestPath,
				'--results-dir',
				resultsDir,
				'--workspaces-dir',
				workspacesDir,
				'--report-only',
			],
			{ cwd: repoRoot, encoding: 'utf8', windowsHide: true },
		);
		expect(reportOnly.status).toBe(0);
		// A second run resumes every replicate: the fixture and answer key each one saw are unchanged.
		const again = spawnSync(
			'bun',
			[
				'scripts/run-benchmark.ts',
				'--manifest',
				manifestPath,
				'--results-dir',
				resultsDir,
				'--workspaces-dir',
				workspacesDir,
				'--skip-preflight',
				'--seed',
				'test',
			],
			{ cwd: repoRoot, encoding: 'utf8', windowsHide: true },
		);
		expect(again.status).toBe(0);
		expect(readFileSync(path.join(resultsDir, 'runs.jsonl'), 'utf8')).toBe(runsJsonl);
		expect(
			JSON.parse(readFileSync(path.join(resultsDir, 'session.json'), 'utf8')),
		).toMatchObject({ resumed: runsJsonl.trim().split(String.fromCharCode(10)).length });
		expect(readFileSync(path.join(resultsDir, 'report.md'), 'utf8')).toContain(
			'aidd Benchmark Report',
		);
		// This launches nested Bun CLI processes, which can exceed Bun's default test timeout on
		// Windows — and at 30s it flaked inside aidd completion gates (observed 30.26s), failing
		// runs for reasons unrelated to the feature under test.
	}, 120_000);
});

describe('benchmark cost resolution', () => {
	const manifest = loadManifest(
		path.join(repoRoot, 'benchmarks', 'manifest.json'),
	) as BenchmarkManifest;

	function usage(input: number, output: number) {
		return {
			cachedTokens: 0,
			inputTokens: input,
			known: input > 0 || output > 0,
			outputTokens: output,
			reasoningTokens: 0,
		};
	}

	test('resolves pricing via cohort target model family', () => {
		const glm = manifest.stacks.find((stack) => stack.label === 'native-glm53-high')!;
		const codex = manifest.stacks.find((stack) => stack.label === 'codex-gpt6-astra-high')!;
		const claude = manifest.stacks.find((stack) => stack.label === 'claude-code-opus48-high')!;
		const ollama = manifest.stacks.find((stack) => stack.label === 'ollama-gpt-oss-20b-low')!;
		expect(pricingForStack(glm, manifest)?.inputPerMtok).toBe(1.4);
		expect(pricingForStack(codex, manifest)?.inputPerMtok).toBe(10);
		// claude and local ollama are intentionally unmetered (trusted/local).
		expect(pricingForStack(claude, manifest)).toBeUndefined();
		expect(pricingForStack(ollama, manifest)).toBeUndefined();
	});

	test('trusts authoritative metered cost over token estimate', () => {
		const glm = manifest.stacks.find((stack) => stack.label === 'native-glm53-high')!;
		const pricing = pricingForStack(glm, manifest)!;
		// claude-code reports a real cost but garbage tokens; trust the real cost.
		expect(
			resolveCost(
				1.75,
				usage(38, 15231),
				pricingForStack(
					manifest.stacks.find((stack) => stack.label === 'claude-code-opus48-high')!,
					manifest,
				),
			),
		).toBe(1.75);
		// even when pricing exists, a positive metered cost wins.
		expect(resolveCost(2.5, usage(100_000, 50_000), pricing)).toBe(2.5);
	});

	test('estimates cost from tokens when none was reported', () => {
		const glm = manifest.stacks.find((stack) => stack.label === 'native-glm53-high')!;
		const pricing = pricingForStack(glm, manifest)!;
		const estimate = estimateCostFromTokens(usage(1_000_000, 0), pricing);
		// 1M input tokens at $1.40/Mtok = $1.40.
		expect(estimate).toBeCloseTo(1.4, 6);
		// native/codex report zero dollars but real tokens -> estimate, not zero.
		expect(resolveCost(0, usage(827_429, 6_462), pricing)).toBeGreaterThan(0);
		const codex = manifest.stacks.find((stack) => stack.label === 'codex-gpt6-astra-high')!;
		const codexPricing = pricingForStack(codex, manifest)!;
		// Astra standard short-context input at $10/Mtok + output at $50/Mtok.
		expect(resolveCost(0, usage(1_013_545, 11_887), codexPricing)).toBeCloseTo(10.7298, 4);
	});

	test('charges cached tokens as an input discount, not additively', () => {
		const codex = manifest.stacks.find((stack) => stack.label === 'codex-gpt6-astra-high')!;
		const pricing = pricingForStack(codex, manifest)!; // input $10, cached $1
		const allCached = {
			cachedTokens: 1_000_000,
			inputTokens: 1_000_000,
			known: true,
			outputTokens: 0,
			reasoningTokens: 0,
		};
		// 1M input, all cached -> billed at the cached rate only ($1), not $10+$1.
		expect(estimateCostFromTokens(allCached, pricing)).toBeCloseTo(1, 6);
		const halfCached = {
			cachedTokens: 500_000,
			inputTokens: 1_000_000,
			known: true,
			outputTokens: 0,
			reasoningTokens: 0,
		};
		// 500k fresh @ $10 + 500k cached @ $1 = 5 + 0.5 = 5.5.
		expect(estimateCostFromTokens(halfCached, pricing)).toBeCloseTo(5.5, 6);
	});

	test('reports unknown when pricing exists but no token data', () => {
		const glm = manifest.stacks.find((stack) => stack.label === 'native-glm53-high')!;
		const pricing = pricingForStack(glm, manifest)!;
		// opencode/kilocode emit neither cost nor tokens -> unknown, never a fake zero.
		expect(resolveCost(0, usage(0, 0), pricing)).toBeNull();
		expect(resolveCost(null, usage(0, 0), pricing)).toBeNull();
	});

	test('keeps reported cost for unmetered families (local)', () => {
		const ollama = manifest.stacks.find((stack) => stack.label === 'ollama-gpt-oss-20b-low')!;
		// no pricing -> local models stay at their reported (free) cost.
		expect(resolveCost(0, usage(394_512, 1_839), pricingForStack(ollama, manifest))).toBe(0);
	});

	test('redistributes cost weight to correctness/reliability when cost is unknown', () => {
		const manifestDir = testTempDirSync('aidd-benchmark-redist-');
		const manifestPath = path.join(manifestDir, 'manifest.json');
		writeFileSync(
			manifestPath,
			JSON.stringify({
				cohorts: [],
				pricing: {},
				scoring: {
					correctnessWeight: 0.45,
					costPolicy: 'unknown-cost-redistribute-to-correctness-and-reliability',
					costWeight: 0.1,
					reliabilityWeight: 0.25,
					timeWeight: 0.2,
				},
				settings: {
					controlTasksExcludedFromComposite: true,
					fixedEnv: {},
					preflight: { timeoutSeconds: 60 },
					scoredRepetitions: 1,
					warmupRepetitions: 0,
				},
				stacks: [
					{ cli: 'native', label: 's-known', model: 'm', view: 'native-best' },
					{ cli: 'native', label: 's-unknown', model: 'm', view: 'native-best' },
				],
				tasks: [
					{
						category: 'agentic',
						command: '--x',
						fixture: 'preflight',
						id: 't1',
						timeoutSeconds: 60,
					},
				],
				version: 1,
			}),
		);
		const redistManifest = loadManifest(manifestPath);
		const emptyUsage = {
			cachedTokens: 0,
			inputTokens: 0,
			known: false,
			outputTokens: 0,
			reasoningTokens: 0,
		};
		const baseRun = {
			artifactPaths: {
				auditReports: [],
				rawLogs: [],
				responses: [],
				runsLedger: [],
				structuredLogs: [],
				workspace: '',
			},
			command: ['bun'],
			durationSeconds: 10,
			fixtureHash: 'f',
			iterations: 1,
			notes: [],
			replicate: 0,
			status: 'success' as const,
			taskId: 't1',
			tokenUsage: emptyUsage,
			workspaceHash: 'w',
		};
		const knownRun = {
			...baseRun,
			correctnessScore: 0.8,
			costUsd: 0 as null | number,
			stack: redistManifest.stacks[0]!,
		};
		const unknownRun = {
			...baseRun,
			correctnessScore: 0.8,
			costUsd: null as null | number,
			stack: redistManifest.stacks[1]!,
		};
		const result = aggregate(redistManifest, [knownRun, unknownRun], {});
		const knownRow = result.agenticRows.find((row) => row.stackLabel === 's-known')!;
		const unknownRow = result.agenticRows.find((row) => row.stackLabel === 's-unknown')!;

		expect(knownRow.costScore).toBe(1);
		expect(unknownRow.costScore).toBeNull();
		// Known $0 keeps its cost term; unknown drops it and rescales quality.
		// With imperfect correctness the unknown stack loses the flat cost bonus.
		expect(unknownRow.compositeScore).toBeLessThan(knownRow.compositeScore);
		// timeScore is 0 (both 10s, max 10s): known = 0.8*0.45 + 1*0.25 + 0 + 1*0.1 = 0.71
		expect(knownRow.compositeScore).toBeCloseTo(0.71, 6);
		// unknown = (0.8/0.7) * (0.8*0.45 + 1*0.25) = 0.697142...
		expect(unknownRow.compositeScore).toBeCloseTo(0.697143, 5);
	});

	test('forwards the two aidd-consumed credentials into the benchmark child', () => {
		const stack = { cli: 'native' as const, label: 's', model: 'm', view: 'v' };
		const workspaceDir = path.join(repoRoot, 'tmp', 'benchmark-env');

		// Both keys are absent from the backend allowlist on purpose -- handing one to a coding CLI
		// would return the value that keeping it out of ~/.aidd/config.json exists to protect -- so
		// nothing but this builder puts them in front of the aidd child. Without the forwarding, a
		// machine that took the keep-credentials-in-the-environment guidance cannot run a benchmark
		// at all: web.allowRemote with no resolvable web.authToken is a hard config error raised
		// while resolving config, long before anything decides the run needs no web server.
		expect(buildBackendSubprocessEnv({}).AIDD_WEB_AUTH_TOKEN).toBeUndefined();
		const forwarded = buildAiddOverrideEnv(
			stack,
			workspaceDir,
			{},
			{
				AIDD_TELEGRAM_BOT_TOKEN: 'telegram-value',
				AIDD_WEB_AUTH_TOKEN: 'auth-value',
			},
		);
		expect(forwarded.AIDD_WEB_AUTH_TOKEN).toBe('auth-value');
		expect(forwarded.AIDD_TELEGRAM_BOT_TOKEN).toBe('telegram-value');

		// An unset credential must stay absent rather than arriving as an empty string: the child
		// resolves web.authToken by trimming, so a blank overlay reads as a value that is present
		// and unusable and shadows whatever the child could have read from its own config file.
		const bare = buildAiddOverrideEnv(stack, workspaceDir, {}, {});
		expect('AIDD_WEB_AUTH_TOKEN' in bare).toBe(false);
		expect('AIDD_TELEGRAM_BOT_TOKEN' in bare).toBe(false);
	});
});
