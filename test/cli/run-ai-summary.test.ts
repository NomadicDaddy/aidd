import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResolvedConfig } from 'aidd-shared/config';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { parseArgs } from 'aidd-shared/args/index';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { createRunAiSummarizer } from '../../cli/src/orchestrator/run/ai-summary.ts';
import { explainAbnormalTermination } from '../../cli/src/orchestrator/run/ai-summary.ts';
import { gitCommitsDiffStat } from '../../cli/src/orchestrator/run/git.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import {
	runOrchestrator,
	type RunFinalSummary,
	type RunObserver,
} from '../../cli/src/orchestrator/orchestrator.ts';
import { writeRunSummary } from '../../cli/src/orchestrator/run/artifacts.ts';
import { initialRunTotals } from '../../cli/src/orchestrator/run/types.ts';
import { CliActiveRunHeartbeat } from '../../cli/src/orchestrator/active-run-heartbeat.ts';

const rootDir = join(import.meta.dir, '..', '..');
const tmpRoot = join(rootDir, '.tmp-run-ai-summary-tests');

const baseConfig: ResolvedConfig = {
	cli: 'native',
	defaultProvider: 'zhipu',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 1,
	idleTimeoutSeconds: 1,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	model: 'glm-5.1',
	noClean: false,
	noWorkBackoffMs: 0,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 3600,
	preflightDoctor: false,
};

class FakeBackend implements CLIBackend {
	readonly idleDefaults = { killMs: 20, nudgeMs: 10 };
	readonly name = 'native' as const;
	private readonly beforeRun: () => Promise<void>;
	private readonly events: AgentEvent[];

	constructor(events: AgentEvent[], beforeRun: () => Promise<void>) {
		this.events = events;
		this.beforeRun = beforeRun;
	}

	async *runPrompt(input: PromptInput): AsyncIterable<AgentEvent> {
		void input;
		await this.beforeRun();
		for (const event of this.events) yield event;
	}
}

async function makeStore(name: string): Promise<FileAiddStore> {
	const projectDir = join(tmpRoot, name);
	await mkdir(join(projectDir, '.aidd', 'features', 'feature-core'), { recursive: true });
	await writeFile(
		join(projectDir, '.aidd', 'features', 'feature-core', 'feature.json'),
		JSON.stringify({
			id: 'feature-core',
			passes: false,
			priority: 1,
			status: 'backlog',
			title: 'Core feature',
		})
	);
	return new FileAiddStore(projectDir);
}

async function completeFeature(store: FileAiddStore): Promise<void> {
	const feature = await store.readFeature('feature-core');
	await store.writeFeature({
		...feature,
		passes: true,
		status: 'completed',
		updatedAt: '2026-05-20T00:00:00.000Z',
	});
}

function plan(projectDir: string) {
	return resolveRunPlan(parseArgs(['--project-dir', projectDir, '--cli', 'native']), baseConfig);
}

afterEach(async () => {
	await rm(tmpRoot, { force: true, recursive: true });
});

describe('createRunAiSummarizer', () => {
	test('returns undefined when directAi is absent', () => {
		const config: ResolvedConfig = { ...baseConfig };
		expect(createRunAiSummarizer(config, rootDir)).toBeUndefined();
	});

	test('returns undefined when directAi is disabled', () => {
		const config: ResolvedConfig = {
			...baseConfig,
			directAi: {
				enabled: false,
				surfaces: {
					directorChat: false,
					directorCycle: false,
					projectAdvisor: false,
					runSummaries: true,
				},
				timeoutSeconds: 15,
			},
		};
		expect(createRunAiSummarizer(config, rootDir)).toBeUndefined();
	});

	test('returns undefined when surfaces.runSummaries is false', () => {
		const config: ResolvedConfig = {
			...baseConfig,
			directAi: {
				enabled: true,
				surfaces: {
					directorChat: true,
					directorCycle: false,
					projectAdvisor: false,
					runSummaries: false,
				},
				timeoutSeconds: 15,
			},
		};
		expect(createRunAiSummarizer(config, rootDir)).toBeUndefined();
	});

	test('returns a function when enabled and surfaces.runSummaries is true', () => {
		const config: ResolvedConfig = {
			...baseConfig,
			directAi: {
				enabled: true,
				surfaces: {
					directorChat: false,
					directorCycle: false,
					projectAdvisor: false,
					runSummaries: true,
				},
				timeoutSeconds: 15,
			},
		};
		const summarizer = createRunAiSummarizer(config, rootDir);
		expect(typeof summarizer).toBe('function');
	});
});

describe('AI summarizer fail-soft contract', () => {
	test('a throwing summarizer resolves to null without changing exit code or mechanical summary', async () => {
		const store = await makeStore('throwing-summarizer');
		const runtimePlan = plan(store.projectDir);
		const heartbeat = await CliActiveRunHeartbeat.start(runtimePlan, {});
		if (!heartbeat) throw new Error('Heartbeat was not created');

		let finalSummary: RunFinalSummary | undefined;
		const observer: RunObserver = {
			...heartbeat.observer,
			onFinalSummary: async (summary) => {
				finalSummary = summary;
				await heartbeat.observer.onFinalSummary?.(summary);
			},
		};

		const throwingSummarizer = async () => {
			throw new Error('AI provider exploded');
		};

		const backend = new FakeBackend(
			[
				{
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					type: 'assistant_text',
				},
				{ exitCode: 0, filesModified: ['x.ts'], type: 'done' },
			],
			async () => {
				await completeFeature(store);
			}
		);

		const exitCode = await runOrchestrator(runtimePlan, {
			aiSummarizer: throwingSummarizer,
			backend,
			observer,
			rootDir,
			runId: heartbeat.id,
			store,
		});
		await heartbeat.dispose();

		// The run succeeds despite the summarizer throwing
		expect(exitCode).toBe(orchestratorExitCodes.success);
		// The mechanical summary is unchanged
		expect(finalSummary).toBeDefined();
		expect(finalSummary!.summary).toBeTruthy();
		// aiSummary is null because the summarizer threw
		expect(finalSummary!.aiSummary).toBeNull();
		// Exit code in the summary is unchanged
		expect(finalSummary!.exitCode).toBe(0);
	});
});

describe('writeRunSummary with stub summarizer', () => {
	test('lands aiSummary in runs.jsonl and onFinalSummary', async () => {
		const store = await makeStore('stub-summarizer-ledger');
		const runtimePlan = plan(store.projectDir);
		const acc = {
			commitsCreated: [],
			completedFeatures: new Set<string>(['feature-core']),
			filesCreated: new Set<string>(),
			filesEdited: new Set<string>(),
			forcedAttributionCommits: new Set<string>(),
			runId: 'test-run-id',
			runStartedAt: new Date().toISOString(),
			runStartedAtMs: Date.now() - 1000,
			runTotals: { ...initialRunTotals, iterations: 1 },
			scopeOverrun: false,
			selectedFeatures: new Set<string>(['feature-core']),
			toolBreakdownTotals: {},
		};

		let capturedSummary: RunFinalSummary | undefined;
		const stubSummarizer = async () => 'AI-generated summary of the run';

		await writeRunSummary(
			{
				aiddProvenance: {
					aiddDirty: false,
					aiddRevision: '0123456789abcdef',
					aiddVersion: '2.125.0',
				},
				aiSummarizer: stubSummarizer,
				backend: new FakeBackend([], async () => {}),
				rootDir,
				store,
				observer: {
					onFinalSummary: async (summary) => {
						capturedSummary = summary;
					},
				},
			},
			runtimePlan,
			acc,
			'completed',
			0,
			'coding completed feature-core'
		);

		// Check onFinalSummary received the aiSummary
		expect(capturedSummary).toBeDefined();
		expect(capturedSummary!.aiSummary).toBe('AI-generated summary of the run');
		expect(capturedSummary!.summary).toBe('coding completed feature-core');
		// No attributed commits → diffStat is explicitly null (not zeros, not absent)
		expect(capturedSummary!.diffStat).toBeNull();
		expect(capturedSummary!.totals).toEqual({ ...initialRunTotals, iterations: 1 });

		// Check runs.jsonl contains the aiSummary
		const ledger = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const summary = JSON.parse(ledger.trim()) as {
			aiddDirty: boolean | null;
			aiddRevision: null | string;
			aiddVersion: null | string;
		};
		expect(summary.aiddDirty).toBe(false);
		expect(summary.aiddRevision).toBe('0123456789abcdef');
		expect(summary.aiddVersion).toBe('2.125.0');
		expect(ledger).toContain('"aiSummary":"AI-generated summary of the run"');
		expect(ledger).toContain('"stopReason":"completed"');
		expect(ledger).toContain('"diffStat":null');
	});

	test('zero-iteration runs never invoke the summarizer', async () => {
		const store = await makeStore('zero-iteration');
		const runtimePlan = plan(store.projectDir);
		const acc = {
			commitsCreated: [],
			completedFeatures: new Set<string>(),
			filesCreated: new Set<string>(),
			filesEdited: new Set<string>(),
			forcedAttributionCommits: new Set<string>(),
			runId: 'test-run-id',
			runStartedAt: new Date().toISOString(),
			runStartedAtMs: Date.now() - 1000,
			runTotals: { ...initialRunTotals, iterations: 0 },
			scopeOverrun: false,
			selectedFeatures: new Set<string>(),
			toolBreakdownTotals: {},
		};

		let summarizerCalled = false;
		const trackingSummarizer = async () => {
			summarizerCalled = true;
			return 'should not be called';
		};

		await writeRunSummary(
			{
				aiSummarizer: trackingSummarizer,
				backend: new FakeBackend([], async () => {}),
				rootDir,
				store,
			},
			runtimePlan,
			acc,
			'completed',
			0,
			'no work found'
		);

		expect(summarizerCalled).toBe(false);

		const ledger = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const entry = JSON.parse(ledger.trim());
		expect(entry.aiSummary).toBeNull();
	});
});

describe('AI summarizer null result propagation', () => {
	test('summarizer returning null writes aiSummary:null in ledger and onFinalSummary', async () => {
		const store = await makeStore('null-summarizer');
		const runtimePlan = plan(store.projectDir);
		const acc = {
			commitsCreated: [],
			completedFeatures: new Set<string>(),
			filesCreated: new Set<string>(),
			filesEdited: new Set<string>(),
			forcedAttributionCommits: new Set<string>(),
			runId: 'test-run-id',
			runStartedAt: new Date().toISOString(),
			runStartedAtMs: Date.now() - 1000,
			runTotals: { ...initialRunTotals, iterations: 1 },
			scopeOverrun: false,
			selectedFeatures: new Set<string>(),
			toolBreakdownTotals: {},
		};

		let capturedSummary: RunFinalSummary | undefined;
		const nullSummarizer = async () => null;

		await writeRunSummary(
			{
				aiSummarizer: nullSummarizer,
				backend: new FakeBackend([], async () => {}),
				rootDir,
				store,
				observer: {
					onFinalSummary: async (summary) => {
						capturedSummary = summary;
					},
				},
			},
			runtimePlan,
			acc,
			'completed',
			0,
			'completed'
		);

		expect(capturedSummary).toBeDefined();
		expect(capturedSummary!.aiSummary).toBeNull();

		const ledger = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const entry = JSON.parse(ledger.trim());
		expect(entry.aiSummary).toBeNull();
	});
});

describe('gitCommitsDiffStat', () => {
	async function git(projectDir: string, args: string[]): Promise<void> {
		const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		if ((await proc.exited) !== 0) {
			throw new Error(
				`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`
			);
		}
	}

	async function gitHead(projectDir: string): Promise<string> {
		const proc = Bun.spawn(['git', '-C', projectDir, 'rev-parse', 'HEAD'], {
			stdout: 'pipe',
			windowsHide: true,
		});
		return (await new Response(proc.stdout).text()).trim();
	}

	test('counts files mutated through bash, not just Edit/Write tool calls', async () => {
		const projectDir = join(tmpRoot, 'diffstat-repo');
		await mkdir(projectDir, { recursive: true });
		await git(projectDir, ['init']);
		await git(projectDir, ['config', 'user.email', 'test@example.invalid']);
		await git(projectDir, ['config', 'user.name', 'Test']);

		// A single commit that touches many files the way a bash-driven run would:
		// none of these went through the Edit/Write tools.
		for (let i = 0; i < 5; i++) {
			await writeFile(join(projectDir, `file-${i}.txt`), `line one\nline two\n`);
		}
		await git(projectDir, ['add', '-A']);
		await git(projectDir, ['commit', '-m', 'bulk scripted change']);
		const head = await gitHead(projectDir);

		const stat = await gitCommitsDiffStat(projectDir, [head]);
		expect(stat.filesChanged).toBe(5);
		expect(stat.insertions).toBe(10);
		expect(stat.deletions).toBe(0);
	});

	test('unions distinct paths across multiple commits', async () => {
		const projectDir = join(tmpRoot, 'diffstat-multi');
		await mkdir(projectDir, { recursive: true });
		await git(projectDir, ['init']);
		await git(projectDir, ['config', 'user.email', 'test@example.invalid']);
		await git(projectDir, ['config', 'user.name', 'Test']);

		await writeFile(join(projectDir, 'shared.txt'), 'a\n');
		await git(projectDir, ['add', '-A']);
		await git(projectDir, ['commit', '-m', 'first']);
		const first = await gitHead(projectDir);

		await writeFile(join(projectDir, 'shared.txt'), 'a\nb\n');
		await writeFile(join(projectDir, 'other.txt'), 'x\n');
		await git(projectDir, ['add', '-A']);
		await git(projectDir, ['commit', '-m', 'second']);
		const second = await gitHead(projectDir);

		// shared.txt is touched by both commits but counts once.
		const stat = await gitCommitsDiffStat(projectDir, [first, second]);
		expect(stat.filesChanged).toBe(2);
	});

	test('returns zeroed stat for no commits', async () => {
		const projectDir = join(tmpRoot, 'diffstat-empty');
		await mkdir(projectDir, { recursive: true });
		await git(projectDir, ['init']);
		const stat = await gitCommitsDiffStat(projectDir, []);
		expect(stat).toEqual({ deletions: 0, filesChanged: 0, insertions: 0 });
	});
});

describe('explainAbnormalTermination', () => {
	test('returns null for a successful run (exit code 0)', () => {
		expect(explainAbnormalTermination(0, 'completed')).toBeNull();
	});

	test('explains a timeout/abort (exit code 124 = aborted)', () => {
		const explanation = explainAbnormalTermination(orchestratorExitCodes.aborted, 'exit_error');
		expect(explanation).not.toBeNull();
		expect(explanation).toContain('Aborted');
		expect(explanation!.toLowerCase()).toContain('timeout');
	});

	test('explains a provider error (exit code 72)', () => {
		const explanation = explainAbnormalTermination(
			orchestratorExitCodes.providerError,
			'exit_error'
		);
		expect(explanation).not.toBeNull();
		expect(explanation).toContain('Provider error');
	});

	test('explains an idle timeout (exit code 71)', () => {
		const explanation = explainAbnormalTermination(
			orchestratorExitCodes.idleTimeout,
			'exit_error'
		);
		expect(explanation).not.toBeNull();
		expect(explanation!.toLowerCase()).toContain('idle');
	});

	test('explains a rate limit (exit code 74)', () => {
		const explanation = explainAbnormalTermination(
			orchestratorExitCodes.rateLimited,
			'exit_error'
		);
		expect(explanation).not.toBeNull();
		expect(explanation!.toLowerCase()).toContain('rate limit');
	});

	test('falls back to stop reason and exit code for unmapped codes', () => {
		const explanation = explainAbnormalTermination(999, 'exit_error');
		expect(explanation).not.toBeNull();
		expect(explanation).toContain('999');
		expect(explanation).toContain('exit_error');
	});
});
