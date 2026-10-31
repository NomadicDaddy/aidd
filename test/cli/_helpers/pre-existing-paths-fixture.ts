import { mkdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import { parseArgs } from 'aidd-shared/args/index';
import { defaultWebConfig, type ResolvedConfig } from 'aidd-shared/config';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { runOrchestrator } from '../../../cli/src/orchestrator/orchestrator.ts';
import { resolveRunPlan } from '../../../cli/src/plan/resolve.ts';

export const rootDir = join(import.meta.dir, '..', '..', '..');
export const tmpRoot = join(rootDir, '.tmp-pre-existing-paths-tests');
export const dirtyPath = 'src/teammate.ts';
export const committedContent = 'export const a = 1;\n';
export const teammateContent = 'export const a = 2; // not committed yet\n';
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
	web: defaultWebConfig,
};

// One tool call: the action happens, then its events arrive, as they do from a real backend.
export type ScriptStep = { act: () => Promise<void> };

class ScriptedBackend implements CLIBackend {
	readonly name = 'native' as const;
	readonly idleDefaults = { nudgeMs: 1000, killMs: 5000 };
	private readonly steps: ScriptStep[];

	constructor(steps: ScriptStep[]) {
		this.steps = steps;
	}

	async *runPrompt(_input: PromptInput): AsyncIterable<AgentEvent> {
		for (const step of this.steps) {
			yield { args: { command: 'x' }, tool: 'bash', type: 'tool_call' };
			await step.act();
			yield { result: 'ok', tool: 'bash', type: 'tool_result' };
		}
		yield {
			chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
			type: 'assistant_text',
		};
		yield { exitCode: 0, filesModified: [], type: 'done' };
	}
}

export async function runGit(projectDir: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const stdout = await new Response(proc.stdout).text();
	if ((await proc.exited) !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
	}
	return stdout;
}

/** A project whose src/teammate.ts holds someone's uncommitted edit, with an old write time so a
 * rewrite cannot land in the same Windows file-time tick as the run-start reading. */
export async function makeProject(name: string): Promise<FileAiddStore> {
	const projectDir = join(tmpRoot, name);
	await mkdir(join(projectDir, '.aidd', 'features', 'feature-core'), { recursive: true });
	await mkdir(join(projectDir, 'src'), { recursive: true });
	await writeFile(
		join(projectDir, '.aidd', 'features', 'feature-core', 'feature.json'),
		JSON.stringify({
			id: 'feature-core',
			passes: false,
			priority: 1,
			status: 'backlog',
			title: 'Core feature',
		}),
	);
	await writeFile(join(projectDir, dirtyPath), committedContent);
	await writeFile(join(projectDir, 'src', 'own.ts'), committedContent);
	const init = Bun.spawn(['git', 'init', projectDir], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	await init.exited;
	await runGit(projectDir, ['config', 'user.email', 'aidd-test@example.invalid']);
	await runGit(projectDir, ['config', 'user.name', 'aidd Test']);
	await runGit(projectDir, ['add', '.']);
	await runGit(projectDir, ['commit', '-m', 'init']);
	await writeFile(join(projectDir, dirtyPath), teammateContent);
	const longAgo = new Date('2026-01-01T00:00:00.000Z');
	await utimes(join(projectDir, dirtyPath), longAgo, longAgo);
	return new FileAiddStore(projectDir);
}

export interface LedgerEntry {
	artifactWarnings?: string[];
	exitCode: number;
	preExistingPathsChanged?: { how: string; path: string }[];
	stopReason: string;
	summary: string;
}

async function lastLedgerEntry(store: FileAiddStore): Promise<LedgerEntry> {
	const content = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
	return JSON.parse(content.trim().split('\n').at(-1) ?? '{}') as LedgerEntry;
}

export async function runBackend(store: FileAiddStore, backend: CLIBackend): Promise<void> {
	await runOrchestrator(
		resolveRunPlan(parseArgs(['--project-dir', store.projectDir, '--cli', 'native']), config),
		{ backend, rootDir, store },
	);
}

/** Commit a feature as a run would: its record and one file of its own, nothing else by path. */
export async function completeAndCommit(store: FileAiddStore, id: string): Promise<void> {
	const feature = await store.readFeature(id);
	await store.writeFeature({
		...feature,
		passes: true,
		status: 'completed',
		updatedAt: new Date().toISOString(),
	});
	await writeFile(join(store.projectDir, 'src', 'own.ts'), `// ${id}\n`);
	await runGit(store.projectDir, ['add', `.aidd/features/${id}`, 'src/own.ts']);
	await runGit(store.projectDir, ['commit', '-m', `feat: ${id}`]);
}

export async function runWith(store: FileAiddStore, steps: ScriptStep[]): Promise<LedgerEntry> {
	const complete: ScriptStep = { act: async () => completeAndCommit(store, 'feature-core') };
	await runBackend(store, new ScriptedBackend([...steps, complete]));
	return await lastLedgerEntry(store);
}

export function howFor(entry: LedgerEntry): string[] {
	return (entry.preExistingPathsChanged ?? [])
		.filter((change) => change.path === dirtyPath)
		.map((change) => change.how);
}
