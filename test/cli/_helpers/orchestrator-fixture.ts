import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import type { ResolvedConfig } from 'aidd-shared/config';

import { parseArgs } from 'aidd-shared/args/index';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveRunPlan } from '../../../cli/src/plan/resolve.ts';
import { removeTempTree } from '../../../shared/src/lib/remove-temp-tree.ts';

export const rootDir = join(import.meta.dir, '..', '..', '..');
export const slowOrchestratorTestTimeoutMs = 15_000;
/** For tests whose subject is a real elapsed deadline, so the run cannot be shortened to buy
 * margin. Both suite entry points impose a 15s per-test ceiling and both stretch these runs:
 * `bun run test` at `--parallel=8` with every worker spawning its own git children, and
 * `bun run test:coverage` serially but under Bun's coverage instrumentation, which is where the
 * three known failures actually surfaced. A run that takes ~1.8s alone has a several-fold tail in
 * either. These tests are not slower than the ones above — they have nothing left to trade. */
export const saturatedSuiteTestTimeoutMs = 45_000;
export const config: ResolvedConfig = {
	cli: 'native',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 1,
	idleTimeoutSeconds: 1,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	noClean: false,
	noWorkBackoffMs: 0,
	preflightDoctor: false,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 3600,
};

export class FakeBackend implements CLIBackend {
	readonly name = 'native' as const;
	readonly idleDefaults = { killMs: 20, nudgeMs: 10 };
	calls = 0;
	inputs: PromptInput[] = [];
	private readonly events: AgentEvent[];
	private readonly beforeRun:
		((callIndex: number, input: PromptInput) => Promise<void> | void) | undefined;

	constructor(
		events: AgentEvent[],
		beforeRun?: (callIndex: number, input: PromptInput) => Promise<void> | void,
	) {
		this.events = events;
		this.beforeRun = beforeRun;
	}

	async *runPrompt(input: PromptInput): AsyncIterable<AgentEvent> {
		const callIndex = this.calls;
		this.calls++;
		this.inputs.push(input);
		await this.beforeRun?.(callIndex, input);
		for (const event of this.events) yield event;
	}
}

export class SequencedBackend implements CLIBackend {
	readonly name = 'native' as const;
	readonly idleDefaults = { killMs: 20, nudgeMs: 10 };
	calls = 0;
	inputs: PromptInput[] = [];
	private readonly batches: AgentEvent[][];
	private readonly beforeRun:
		((callIndex: number, input: PromptInput) => Promise<void> | void) | undefined;

	constructor(
		batches: AgentEvent[][],
		beforeRun?: (callIndex: number, input: PromptInput) => Promise<void> | void,
	) {
		this.batches = batches;
		this.beforeRun = beforeRun;
	}

	async *runPrompt(input: PromptInput): AsyncIterable<AgentEvent> {
		const batch = this.batches[this.calls] ?? this.batches.at(-1) ?? [];
		const callIndex = this.calls;
		this.calls++;
		this.inputs.push(input);
		await this.beforeRun?.(callIndex, input);
		for (const event of batch) yield event;
	}
}

export class HangingAfterMarkerBackend implements CLIBackend {
	readonly name = 'native' as const;
	readonly idleDefaults = { killMs: 20, nudgeMs: 10 };
	calls = 0;
	inputs: PromptInput[] = [];
	private readonly beforeRun:
		((callIndex: number, input: PromptInput) => Promise<void> | void) | undefined;

	constructor(beforeRun?: (callIndex: number, input: PromptInput) => Promise<void> | void) {
		this.beforeRun = beforeRun;
	}

	async *runPrompt(input: PromptInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
		const callIndex = this.calls;
		this.calls++;
		this.inputs.push(input);
		await this.beforeRun?.(callIndex, input);
		yield {
			chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
			type: 'assistant_text',
		};
		await new Promise<void>((resolve) => {
			if (signal.aborted) {
				resolve();
				return;
			}
			signal.addEventListener('abort', () => resolve(), { once: true });
		});
	}
}

async function makeStoreAt(tmpRoot: string, name: string): Promise<FileAiddStore> {
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
		}),
	);
	return new FileAiddStore(projectDir);
}

export async function addFeature(
	store: FileAiddStore,
	id: string,
	priority: number,
): Promise<void> {
	await store.writeFeature({
		id,
		passes: false,
		priority,
		status: 'backlog',
		title: id,
	});
}

export async function completeFeature(store: FileAiddStore, id: string): Promise<void> {
	const feature = await store.readFeature(id);
	await store.writeFeature({
		...feature,
		passes: true,
		status: 'completed',
		updatedAt: '2026-05-08T00:00:00.000Z',
	});
}

export async function runGit(projectDir: string, args: string[]): Promise<void> {
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

export async function gitText(projectDir: string, args: string[]): Promise<string> {
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
	return await new Response(proc.stdout).text();
}

export async function initializeGitProject(projectDir: string): Promise<void> {
	const init = Bun.spawn(['git', 'init', projectDir], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await init.exited) !== 0) {
		const stderr = await new Response(init.stderr).text();
		throw new Error(`git init failed: ${stderr}`);
	}
	// Identity via a direct .git/config append instead of two `git config` spawns: this
	// fixture runs 13+ times in this file and git process startup dominates its cost. Safe
	// only because `.git` here is always a fresh directory `git init` just created.
	await appendFile(
		join(projectDir, '.git', 'config'),
		'[user]\n\temail = aidd-test@example.invalid\n\tname = aidd Test\n',
	);
	await runGit(projectDir, ['add', '.']);
	await runGit(projectDir, ['commit', '-m', 'init']);
}

export async function captureStdout(run: () => Promise<void>): Promise<string> {
	// Saved only to be assigned straight back in the finally below, never called detached, so
	// the receiver goes back with it. Binding it here would be wrong rather than safer: the
	// restored value would then be a bound wrapper rather than the function that was replaced.
	// eslint-disable-next-line @typescript-eslint/unbound-method
	const originalWrite = process.stdout.write;
	let output = '';
	process.stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]): boolean => {
		output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
		const callback = args.find((arg): arg is (error?: Error | null) => void => {
			return typeof arg === 'function';
		});
		callback?.();
		return true;
	}) as typeof process.stdout.write;
	try {
		await run();
		return output;
	} finally {
		process.stdout.write = originalWrite;
	}
}

export function plan(projectDir: string, extra: string[] = []) {
	return resolveRunPlan(
		parseArgs(['--project-dir', projectDir, '--cli', 'native', ...extra]),
		config,
	);
}

export function gitHeavyPlan(projectDir: string, extra: string[] = []) {
	return resolveRunPlan(parseArgs(['--project-dir', projectDir, '--cli', 'native', ...extra]), {
		...config,
		idleNudgeTimeoutSeconds: 15,
		idleTimeoutSeconds: 15,
	});
}

/**
 * A scope root plus the two hooks its suite needs. `cleanup` belongs in `afterAll`, not
 * `afterEach`: an orchestrator test spawns git children, and on Windows those keep handles on
 * files under the root for a moment after they exit. Removing the whole root between tests meant
 * one removal per test -- each able to trip over a handle left by any earlier test's fixture, and
 * each reported against whichever test had just passed rather than the one that opened the file.
 * Once per suite, after every child of every test is gone, is both a thirtieth of the attempts and
 * the point at which the handles are actually released.
 *
 * That only holds while each fixture name is used once, which `makeStore` enforces rather than
 * assumes: a reused name would silently hand the second test the first one's `.git` directory and
 * leftover features.
 */
export function createOrchestratorTestContext(scope: string): {
	cleanup: () => Promise<void>;
	makeStore: (name: string) => Promise<FileAiddStore>;
} {
	const tmpRoot = join(rootDir, `.tmp-orchestrator-tests-${scope}`);
	const claimed = new Set<string>();
	return {
		cleanup: () => removeTempTree(tmpRoot),
		makeStore: async (name) => {
			if (claimed.has(name)) {
				throw new Error(
					`orchestrator fixture "${name}" is already claimed in the "${scope}" suite. ` +
						'Fixtures live until the suite ends, so each test needs its own name.',
				);
			}
			claimed.add(name);
			return await makeStoreAt(tmpRoot, name);
		},
	};
}
