import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import type { ResolvedConfig } from 'aidd-shared/config';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { classifyWebRun } from 'aidd-shared/runs/outcome';
import { parseArgs } from 'aidd-shared/args/index';
import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

// Regression coverage for run-end-dirty-tree-check: a run that dirties tracked source AFTER its
// last feature commit (the post-commit formatter/codegen case) must not end as a silent clean
// 'completed'. The run-end check diffs the working tree against the run-start baseline, so
// pre-existing operator dirt and aidd-owned .aidd metadata churn must never trip it.

const rootDir = join(import.meta.dir, '..', '..');
const tmpRoot = join(rootDir, '.tmp-run-end-dirty-source-tests');
const slowTestTimeoutMs = 15_000;
const config: ResolvedConfig = {
	cli: 'native',
	reasoningEffort: 'low',
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	timeoutSeconds: 3600,
	preflightDoctor: false,
	idleTimeoutSeconds: 15,
	idleNudgeTimeoutSeconds: 15,
	dirtyTreeThreshold: 50,
	noWorkBackoffMs: 0,
	noClean: false,
	quitOnAbort: 0,
	rateLimitBufferSeconds: 60,
	rateLimitBackoffSeconds: 300,
};

class FakeBackend implements CLIBackend {
	readonly name = 'native' as const;
	readonly idleDefaults = { nudgeMs: 10, killMs: 20 };
	calls = 0;
	private readonly events: AgentEvent[];
	private readonly beforeRun: (() => Promise<void>) | undefined;

	constructor(events: AgentEvent[], beforeRun?: () => Promise<void>) {
		this.events = events;
		this.beforeRun = beforeRun;
	}

	async *runPrompt(_input: PromptInput): AsyncIterable<AgentEvent> {
		this.calls++;
		await this.beforeRun?.();
		for (const event of this.events) yield event;
	}
}

const completionEvents: AgentEvent[] = [
	{
		type: 'assistant_text',
		chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
	},
	{ type: 'done', exitCode: 0, filesModified: [] },
];

const bashCompletionEvents: AgentEvent[] = [
	{
		type: 'tool_call',
		tool: 'bash',
		args: { command: "printf 'export const a = 2;\\n' > src/app.ts" },
	},
	...completionEvents,
];

async function makeStore(name: string): Promise<FileAiddStore> {
	const projectDir = join(tmpRoot, name);
	await mkdir(join(projectDir, '.aidd', 'features', 'feature-core'), { recursive: true });
	await writeFile(
		join(projectDir, '.aidd', 'features', 'feature-core', 'feature.json'),
		JSON.stringify({
			id: 'feature-core',
			title: 'Core feature',
			status: 'backlog',
			passes: false,
			priority: 1,
		}),
	);
	return new FileAiddStore(projectDir);
}

async function completeFeature(store: FileAiddStore, id: string): Promise<void> {
	const feature = await store.readFeature(id);
	await store.writeFeature({
		...feature,
		status: 'completed',
		passes: true,
		updatedAt: '2026-07-10T00:00:00.000Z',
	});
}

async function commitCompletedFeature(store: FileAiddStore): Promise<void> {
	await completeFeature(store, 'feature-core');
	await runGit(store.projectDir, ['add', '.aidd/features/feature-core/feature.json']);
	await runGit(store.projectDir, ['commit', '-m', 'feat: complete feature']);
}

async function runGit(projectDir: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
	}
}

async function initializeGitProject(projectDir: string): Promise<void> {
	const init = Bun.spawn(['git', 'init', projectDir], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await init.exited) !== 0) {
		const stderr = await new Response(init.stderr).text();
		throw new Error(`git init failed: ${stderr}`);
	}
	await runGit(projectDir, ['config', 'user.email', 'aidd-test@example.invalid']);
	await runGit(projectDir, ['config', 'user.name', 'aidd Test']);
	await runGit(projectDir, ['add', '.']);
	await runGit(projectDir, ['commit', '-m', 'init']);
}

function plan(projectDir: string) {
	return resolveRunPlan(parseArgs(['--project-dir', projectDir, '--cli', 'native']), config);
}

interface LedgerEntry {
	artifactWarnings?: string[];
	exitCode: number;
	residualDirtySourceFiles?: string[];
	stopReason: string;
	summary: string;
	unattributedDirtySourceFiles?: string[];
}

async function lastLedgerEntry(store: FileAiddStore): Promise<LedgerEntry> {
	const content = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
	return JSON.parse(content.trim().split('\n').at(-1) ?? '{}') as LedgerEntry;
}

afterEach(async () => {
	await removeTempTree(tmpRoot);
});

describe('run-end dirty-source check', () => {
	test(
		'a run that dirties tracked source through a recorded bash command remains attributed',
		async () => {
			const store = await makeStore('post-commit-dirt');
			await mkdir(join(store.projectDir, 'src'), { recursive: true });
			await writeFile(join(store.projectDir, 'src', 'app.ts'), 'export const a = 1;\n');
			await writeFile(join(store.projectDir, 'preexisting.txt'), 'operator wip\n');
			await initializeGitProject(store.projectDir);
			// Pre-existing operator dirt, present BEFORE the run starts: must never be flagged.
			await writeFile(join(store.projectDir, 'preexisting.txt'), 'operator wip edited\n');

			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend: new FakeBackend(bashCompletionEvents, async () => {
					await commitCompletedFeature(store);
					await writeFile(
						join(store.projectDir, 'src', 'app.ts'),
						'export const a = 2;\n',
					);
					await writeFile(join(store.metadataDir, 'CHANGELOG.md'), '# churn\n');
				}),
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			const entry = await lastLedgerEntry(store);
			expect(entry.stopReason).toBe('completed');
			expect(entry.exitCode).toBe(orchestratorExitCodes.success);
			// The run-caused dirt is recorded, pre-existing and .aidd dirt excluded.
			expect(entry.residualDirtySourceFiles).toEqual(['src/app.ts']);
			expect(entry.unattributedDirtySourceFiles).toBeUndefined();
			expect(entry.artifactWarnings).toContain('residual_dirty_source_files');
			expect(entry.summary).toContain('uncommitted_source_files:');
			// The shared classifier every run surface uses must downgrade the real recorded
			// entry from a clean emerald Completed to the amber dirty-tree outcome.
			const outcome = classifyWebRun({
				exitCode: entry.exitCode,
				status: 'completed',
				stopReason: entry.stopReason,
				summary: entry.summary,
			});
			expect(outcome.tone).toBe('amber');
			expect(outcome.label).toBe('Completed · dirty tree');
		},
		slowTestTimeoutMs,
	);

	test(
		'an external writer mid-run is observed without downgrading the run outcome',
		async () => {
			const store = await makeStore('concurrent-operator-dirt');
			await mkdir(join(store.projectDir, 'src'), { recursive: true });
			await writeFile(join(store.projectDir, 'src', 'operator.ts'), 'export const a = 1;\n');
			await initializeGitProject(store.projectDir);

			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend: new FakeBackend(completionEvents, async () => {
					await commitCompletedFeature(store);
					await writeFile(
						join(store.projectDir, 'src', 'operator.ts'),
						'export const a = 2;\n',
					);
				}),
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			const entry = await lastLedgerEntry(store);
			expect(entry.residualDirtySourceFiles).toBeUndefined();
			expect(entry.unattributedDirtySourceFiles).toEqual(['src/operator.ts']);
			expect(entry.artifactWarnings).toContain('unattributed_dirty_source_files');
			expect(entry.artifactWarnings ?? []).not.toContain('residual_dirty_source_files');
			expect(entry.summary).toContain('unattributed_source_files:');
			expect(entry.summary).not.toContain('uncommitted_source_files:');
			const outcome = classifyWebRun({
				exitCode: entry.exitCode,
				status: 'completed',
				stopReason: entry.stopReason,
				summary: entry.summary,
			});
			expect(outcome.tone).toBe('emerald');
			expect(outcome.label).toBe('Completed');
		},
		slowTestTimeoutMs,
	);

	test(
		'pre-existing operator dirt and .aidd metadata churn alone leave a clean completed untouched',
		async () => {
			const store = await makeStore('clean-completion');
			await writeFile(join(store.projectDir, 'preexisting.txt'), 'operator wip\n');
			await initializeGitProject(store.projectDir);
			await writeFile(join(store.projectDir, 'preexisting.txt'), 'operator wip edited\n');

			const exitCode = await runOrchestrator(plan(store.projectDir), {
				rootDir,
				store,
				backend: new FakeBackend(completionEvents, async () => {
					await commitCompletedFeature(store);
					// Harness-style residue only; no new source dirt.
					await writeFile(join(store.metadataDir, 'CHANGELOG.md'), '# churn\n');
				}),
			});

			expect(exitCode).toBe(orchestratorExitCodes.success);
			const entry = await lastLedgerEntry(store);
			expect(entry.stopReason).toBe('completed');
			expect(entry.residualDirtySourceFiles).toBeUndefined();
			expect(entry.unattributedDirtySourceFiles).toBeUndefined();
			expect(entry.artifactWarnings ?? []).not.toContain('residual_dirty_source_files');
			expect(entry.summary).not.toContain('uncommitted_source_files:');
			const outcome = classifyWebRun({
				exitCode: entry.exitCode,
				status: 'completed',
				stopReason: entry.stopReason,
				summary: entry.summary,
			});
			expect(outcome.tone).toBe('emerald');
			expect(outcome.label).toBe('Completed');
		},
		slowTestTimeoutMs,
	);
});
